"""Transactional persistence primitives for contract-compatible audit events.

The pure domain contract in iq_core.audit.audit_event is the single source of
truth for canonical hashing and event validation. Callers own the SQLAlchemy
transaction (with session.begin()); this module never commits.
"""
from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from database.models.audit import (
    ApprovalIntent,
    AuditEvent as AuditEventRow,
    AuditStreamHead,
    ConsumedNonce,
    OutboxEvent,
)
from database.tenant_context import set_tenant_context
from iq_core.audit.audit_event import (
    AuditEvent as ContractAuditEvent,
    verify_audit_chain,
)

_SHA256 = re.compile(r"^[a-f0-9]{64}$")


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Datetime values must be timezone-aware")
    return value.astimezone(timezone.utc)


def _to_contract_event(row: AuditEventRow) -> ContractAuditEvent:
    """Rehydrate a stored row using the canonical immutable event contract."""
    metadata = dict(row.metadata_json)
    # SQLite drops timezone offsets for DateTime(timezone=True); values written
    # by this adapter are normalized to UTC before insertion.
    stored_at = row.created_at
    if stored_at.tzinfo is None or stored_at.utcoffset() is None:
        stored_at = stored_at.replace(tzinfo=timezone.utc)
    else:
        stored_at = stored_at.astimezone(timezone.utc)
    return ContractAuditEvent.create(
        event_id=row.event_id,
        stream_id=row.stream_id,
        occurred_at=int(stored_at.timestamp()),
        actor_id=row.actor,
        action=row.action,
        resource_type=row.resource_type,
        resource_id=row.resource_id,
        outcome=row.outcome,
        correlation_id=row.correlation_id or row.event_id,
        metadata=metadata,
        previous_event_sha256=row.previous_digest,
    )


def append_audit_event(
    session: Session,
    *,
    tenant_id: str,
    stream_id: str,
    actor: str,
    action: str,
    resource_type: str,
    resource_id: str,
    outcome: str,
    metadata: dict[str, Any] | None = None,
    correlation_id: str | None = None,
    event_id: str | None = None,
    created_at: datetime | None = None,
) -> AuditEventRow:
    """Append one contract-valid event under a stream-head row lock."""
    if not isinstance(metadata, (dict, type(None))):
        raise ValueError("Audit metadata must be an object")
    if not isinstance(tenant_id, str) or not tenant_id.strip():
        raise ValueError("Tenant identity is required")
    if not stream_id or len(stream_id) > 128:
        raise ValueError("stream_id must contain 1..128 characters")

    set_tenant_context(session, tenant_id)
    head = session.scalar(
        select(AuditStreamHead)
        .where(
            AuditStreamHead.tenant_id == tenant_id,
            AuditStreamHead.stream_id == stream_id,
        )
        .with_for_update()
    )
    if head is None:
        head = AuditStreamHead(
            tenant_id=tenant_id, stream_id=stream_id, sequence=0, last_digest=None
        )
        session.add(head)
        # Concurrent first writers may race on the composite primary key.
        # The losing caller must roll back and retry the entire transaction.
        session.flush()

    occurred = _utc(created_at or datetime.now(timezone.utc))
    identifier = event_id or str(uuid4())
    # Bind tenant identity into the hashed payload; the same logical stream name
    # in two tenants must not produce interchangeable event digests.
    safe_metadata = dict(metadata or {})
    safe_metadata["tenant_id"] = tenant_id
    contract_event = ContractAuditEvent.create(
        event_id=identifier,
        stream_id=stream_id,
        occurred_at=int(occurred.timestamp()),
        actor_id=actor,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        outcome=outcome,
        correlation_id=correlation_id or identifier,
        metadata=safe_metadata,
        previous_event_sha256=head.last_digest,
    )

    event = AuditEventRow(
        event_id=contract_event.event_id,
        tenant_id=tenant_id,
        stream_id=contract_event.stream_id,
        sequence=head.sequence + 1,
        created_at=datetime.fromtimestamp(contract_event.occurred_at, timezone.utc),
        actor=contract_event.actor_id,
        action=contract_event.action,
        resource_type=contract_event.resource_type,
        resource_id=contract_event.resource_id,
        outcome=contract_event.outcome,
        correlation_id=contract_event.correlation_id,
        metadata_json=dict(contract_event.metadata),
        previous_digest=contract_event.previous_event_sha256,
        digest=contract_event.event_sha256,
    )
    session.add(event)
    head.sequence = event.sequence
    head.last_digest = event.digest
    session.flush()
    return event


def verify_persisted_audit_chain(
    session: Session, *, tenant_id: str, stream_id: str
) -> str | None:
    """Verify persisted sequence continuity and canonical event hashes.

    This validates rows returned by the database. It cannot prove that the
    database omitted no rows; compare the final digest with an independently
    protected checkpoint for completeness/tamper detection.
    """
    set_tenant_context(session, tenant_id)
    rows = list(
        session.scalars(
            select(AuditEventRow)
            .where(
                AuditEventRow.tenant_id == tenant_id,
                AuditEventRow.stream_id == stream_id,
            )
            .order_by(AuditEventRow.sequence.asc())
        ).all()
    )
    if not rows:
        return None
    expected_sequence = 1
    events: list[ContractAuditEvent] = []
    for row in rows:
        if row.sequence != expected_sequence:
            raise ValueError("AUDIT_SEQUENCE_GAP")
        if row.metadata_json.get("tenant_id") != tenant_id:
            raise ValueError("AUDIT_TENANT_BINDING_MISMATCH")
        contract_event = _to_contract_event(row)
        if contract_event.event_sha256 != row.digest:
            raise ValueError("AUDIT_EVENT_DIGEST_MISMATCH")
        events.append(contract_event)
        expected_sequence += 1
    return verify_audit_chain(events=events)


def persist_verified_approval(
    session: Session,
    *,
    tenant_id: str,
    intent_id: str,
    raw_nonce: str,
    request_digest: str,
    signer_key_id: str,
    expires_at: datetime,
    actor: str,
    stream_id: str = "approvals",
) -> ApprovalIntent:
    """Persist a previously verified approval exactly once.

    Signature, signer authorization, request binding, and tenant authorization
    must be verified before this function is called. The raw nonce is hashed
    before storage. Duplicate nonce insertion raises IntegrityError; the caller
    must roll back the outer transaction.
    """
    if not raw_nonce or len(raw_nonce) > 512:
        raise ValueError("A bounded approval nonce is required")
    if not _SHA256.fullmatch(request_digest):
        raise ValueError("request_digest must be a lowercase SHA-256 digest")
    if not intent_id or not signer_key_id or len(signer_key_id) > 200:
        raise ValueError("intent_id and signer_key_id are required")
    expiry = _utc(expires_at)
    now = datetime.now(timezone.utc)
    if expiry <= now:
        raise ValueError("Approval intent must not already be expired")

    set_tenant_context(session, tenant_id)
    nonce_hash = hashlib.sha256(raw_nonce.encode("utf-8")).hexdigest()
    intent = ApprovalIntent(
        intent_id=intent_id,
        tenant_id=tenant_id,
        request_digest=request_digest,
        signer_key_id=signer_key_id,
        status="approved",
        created_at=now,
        expires_at=expiry,
    )
    session.add(
        ConsumedNonce(
            tenant_id=tenant_id,
            nonce_hash=nonce_hash,
            intent_id=intent_id,
            consumed_at=now,
            expires_at=expiry,
        )
    )
    session.add(intent)
    append_audit_event(
        session,
        tenant_id=tenant_id,
        stream_id=stream_id,
        actor=actor,
        action="approval.persisted",
        resource_type="approval_intent",
        resource_id=intent_id,
        outcome="approved",
        metadata={"request_digest": request_digest, "signer_key_id": signer_key_id},
    )
    session.add(
        OutboxEvent(
            outbox_id=str(uuid4()),
            tenant_id=tenant_id,
            event_type="approval.persisted",
            payload={"intent_id": intent_id, "request_digest": request_digest},
            created_at=now,
        )
    )
    session.flush()
    return intent
