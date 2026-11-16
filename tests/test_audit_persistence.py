from datetime import UTC, datetime
from hashlib import sha256

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from sqlalchemy import create_engine, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database.audit_persistence import (
    append_audit_event,
    persist_verified_approval,
    verify_persisted_audit_chain,
)
from database.models import (
    ApprovalIntent,
    AuditEvent,
    AuditStreamHead,
    Base,
    ConsumedNonce,
    OutboxEvent,
)
from iq_core.agents.approval_contract import (
    ApprovalClaims,
    canonical_approval_bytes,
)


@pytest.fixture
def session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as value:
        yield value
    engine.dispose()


def _signed_approval(*, nonce: str, proposal_id: str = "proposal-1"):
    private_key = Ed25519PrivateKey.generate()
    now = int(datetime.now(UTC).timestamp())
    digest = sha256(proposal_id.encode("utf-8")).hexdigest()
    payload = {
        "iss": "infiniteX-local-approval",
        "aud": "infiniteX-apply",
        "jti": nonce,
        "sub": "reviewer-test-1",
        "reviewer_role": "owner",
        "repository_id": "1426264287",
        "target_branch": "fix/infiniteX-foundation-hardening",
        "base_commit_sha": "a" * 40,
        "proposal_id": proposal_id,
        "proposal_sha256": digest,
        "file_paths": ["src/app.py"],
        "policy_version": "1.0",
        "schema_version": 1,
        "iat": now - 10,
        "nbf": now - 10,
        "exp": now + 300,
    }
    claims = ApprovalClaims.from_payload(payload)
    signature = private_key.sign(canonical_approval_bytes(claims))
    expected = {
        "expected_issuer": payload["iss"],
        "expected_audience": payload["aud"],
        "expected_reviewer_subject": payload["sub"],
        "expected_reviewer_role": payload["reviewer_role"],
        "expected_repository_id": payload["repository_id"],
        "expected_branch": payload["target_branch"],
        "expected_base_commit_sha": payload["base_commit_sha"],
        "expected_proposal_id": payload["proposal_id"],
        "expected_proposal_sha256": payload["proposal_sha256"],
        "expected_policy_version": payload["policy_version"],
        "expected_file_paths": ("src/app.py",),
        "now": now,
    }
    return payload, signature, private_key.public_key(), expected


def _persist(session, signed):
    payload, signature, public_key, expected = signed
    return persist_verified_approval(
        session,
        tenant_id="tenant-a",
        payload=payload,
        signature=signature,
        public_key=public_key,
        **expected,
        signer_key_id="trusted-key-1",
        actor="reviewer-test-1",
    )


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
    with pytest.raises(ValueError, match="SENSITIVE"):
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


def test_signed_approval_nonce_intent_audit_and_outbox_are_atomic(session):
    with session.begin():
        intent = _persist(session, _signed_approval(nonce="one-time-nonce-0001"))

    assert intent.status == "approved"
    assert session.scalar(select(ApprovalIntent)) is not None
    assert session.scalar(select(ConsumedNonce)) is not None
    assert session.scalar(select(AuditEvent)) is not None
    assert session.scalar(select(OutboxEvent)) is not None


def test_duplicate_signed_nonce_rejects_second_intent(session):
    with session.begin():
        _persist(session, _signed_approval(nonce="replay-nonce-0001"))
    second = _signed_approval(
        nonce="replay-nonce-0001", proposal_id="proposal-2"
    )

    with pytest.raises(IntegrityError):
        with session.begin():
            _persist(session, second)

    assert len(session.scalars(select(ApprovalIntent)).all()) == 1
    assert len(session.scalars(select(AuditEvent)).all()) == 1
    assert len(session.scalars(select(OutboxEvent)).all()) == 1


def test_invalid_signature_writes_no_approval_records(session):
    payload, signature, public_key, expected = _signed_approval(
        nonce="invalid-signature-nonce"
    )
    invalid_signature = bytes([signature[0] ^ 1]) + signature[1:]

    with pytest.raises(ValueError, match="SIGNATURE_INVALID"):
        with session.begin():
            persist_verified_approval(
                session,
                tenant_id="tenant-a",
                payload=payload,
                signature=invalid_signature,
                public_key=public_key,
                **expected,
                signer_key_id="trusted-key-1",
                actor="reviewer-test-1",
            )

    assert session.scalar(select(ApprovalIntent)) is None
    assert session.scalar(select(ConsumedNonce)) is None
    assert session.scalar(select(AuditEvent)) is None
    assert session.scalar(select(OutboxEvent)) is None


def test_expired_signed_approval_is_rejected_before_persistence(session):
    payload, signature, public_key, expected = _signed_approval(
        nonce="expired-nonce-0001"
    )
    expected["now"] = payload["exp"]

    with pytest.raises(ValueError, match="APPROVAL_EXPIRED"):
        with session.begin():
            persist_verified_approval(
                session,
                tenant_id="tenant-a",
                payload=payload,
                signature=signature,
                public_key=public_key,
                **expected,
                signer_key_id="trusted-key-1",
                actor="reviewer-test-1",
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
