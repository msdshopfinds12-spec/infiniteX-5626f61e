from datetime import datetime, timedelta, timezone
from hashlib import sha256

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database.audit_persistence import (
    append_audit_event,
    persist_verified_approval,
    verify_persisted_audit_chain,
)\nfrom iq_core.audit.audit_event import AuditEvent as ContractAuditEvent
from database.models import (
    ApprovalIntent,
    AuditEvent,
    AuditStreamHead,
    Base,
    ConsumedNonce,
    OutboxEvent,
)


@pytest.fixture
def session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as value:
        yield value
    engine.dispose()


def test_audit_stream_appends_ordered_hash_chain(session):
    with session.begin():
        first = append_audit_event(
            session,
            tenant_id="tenant-a",
            stream_id="system",
            actor="tester",
            action="created",
            resource_type="test",
            resource_id="one",
            outcome="success",
        )
    with session.begin():
        second = append_audit_event(
            session,
            tenant_id="tenant-a",
            stream_id="system",
            actor="tester",
            action="updated",
            resource_type="test",
            resource_id="one",
            outcome="success",
        )

    assert first.sequence == 1
    assert first.previous_digest is None
    assert second.sequence == 2
    assert second.previous_digest == first.digest
    head = session.get(AuditStreamHead, ("tenant-a", "system"))
    assert head is not None
    assert head.sequence == 2
    assert head.last_digest == second.digest
    assert verify_persisted_audit_chain(
        session, tenant_id="tenant-a", stream_id="system"
    ) == second.digest



def test_audit_metadata_rejects_secret_like_keys(session):
    with pytest.raises(ValueError, match="Sensitive"):
        with session.begin():
            append_audit_event(
                session,
                tenant_id="tenant-a",
                stream_id="system",
                actor="tester",
                action="unsafe",
                resource_type="test",
                resource_id="one",
                outcome="denied",
                metadata={"access_token": "never-store"},
            )
    assert session.scalar(select(AuditEvent)) is None


def test_approval_nonce_intent_audit_and_outbox_are_atomic(session):
    request_digest = sha256(b"approved request").hexdigest()
    with session.begin():
        intent = persist_verified_approval(
            session,
            tenant_id="tenant-a",
            intent_id="intent-1",
            raw_nonce="one-time-random-nonce",
            request_digest=request_digest,
            signer_key_id="owner-key-1",
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
            actor="owner",
        )

    assert intent.intent_id == "intent-1"
    assert session.scalar(select(ApprovalIntent)) is not None
    assert session.scalar(select(ConsumedNonce)) is not None
    assert session.scalar(select(AuditEvent)) is not None
    assert session.scalar(select(OutboxEvent)) is not None


def test_duplicate_nonce_rejects_second_intent(session):
    request_digest = sha256(b"approved request").hexdigest()
    expiry = datetime.now(timezone.utc) + timedelta(minutes=5)
    with session.begin():
        persist_verified_approval(
            session,
            tenant_id="tenant-a",
            intent_id="intent-1",
            raw_nonce="same-nonce",
            request_digest=request_digest,
            signer_key_id="owner-key-1",
            expires_at=expiry,
            actor="owner",
        )

    with pytest.raises(IntegrityError):
        with session.begin():
            persist_verified_approval(
                session,
                tenant_id="tenant-a",
                intent_id="intent-2",
                raw_nonce="same-nonce",
                request_digest=request_digest,
                signer_key_id="owner-key-1",
                expires_at=expiry,
                actor="owner",
            )

    assert session.scalar(select(ApprovalIntent).where(
        ApprovalIntent.intent_id == "intent-2"
    )) is None
    assert len(session.scalars(select(AuditEvent)).all()) == 1


def test_approval_persistence_rejects_expired_intent(session):
    with pytest.raises(ValueError, match="expired"):
        with session.begin():
            persist_verified_approval(
                session,
                tenant_id="tenant-a",
                intent_id="expired-intent",
                raw_nonce="nonce",
                request_digest=sha256(b"request").hexdigest(),
                signer_key_id="owner-key-1",
                expires_at=datetime.now(timezone.utc) - timedelta(seconds=1),
                actor="owner",
            )
    assert session.scalar(select(ApprovalIntent)) is None



def test_persisted_chain_detects_digest_tampering(session):
    with session.begin():
        event = append_audit_event(
            session,
            tenant_id="tenant-a",
            stream_id="tamper-test",
            actor="tester",
            action="created",
            resource_type="test",
            resource_id="one",
            outcome="success",
        )
    event.digest = "0" * 64
    session.commit()

    with pytest.raises(ValueError, match="DIGEST_MISMATCH"):
        verify_persisted_audit_chain(
            session, tenant_id="tenant-a", stream_id="tamper-test"
        )


def test_persisted_chain_detects_sequence_gap(session):
    with session.begin():
        append_audit_event(
            session,
            tenant_id="tenant-a",
            stream_id="gap-test",
            actor="tester",
            action="created",
            resource_type="test",
            resource_id="one",
            outcome="success",
        )
    row = session.scalar(select(AuditEvent))
    row.sequence = 3
    session.commit()

    with pytest.raises(ValueError, match="SEQUENCE_GAP"):
        verify_persisted_audit_chain(
            session, tenant_id="tenant-a", stream_id="gap-test"
        )


def test_tenant_id_is_bound_into_canonical_event_digest(session):
    with session.begin():
        event = append_audit_event(
            session,
            tenant_id="tenant-a",
            stream_id="shared-name",
            actor="tester",
            action="created",
            resource_type="test",
            resource_id="one",
            outcome="success",
        )
    assert event.metadata_json["tenant_id"] == "tenant-a"
    assert verify_persisted_audit_chain(
        session, tenant_id="tenant-a", stream_id="shared-name"
    ) == event.digest
