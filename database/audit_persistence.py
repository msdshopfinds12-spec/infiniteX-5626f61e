"""Transactional persistence primitives for audit events and approvals.

Callers must verify approval signatures before entering this module and own the
outer SQLAlchemy transaction (with session.begin()). This module never commits.
A nonce, intent, audit event, stream-head update, and outbox record therefore
participate in the caller's single transaction.
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from database.models.audit import (
    ApprovalIntent,
    AuditEvent,
    AuditStreamHead,
    ConsumedNonce,
    OutboxEvent,
)
from database.tenant_context import set_tenant_context

_SECRET_KEY = re.compile(
    r"(password|secret|token|authorization|cookie|private.?key|api.?key)", re.I
)
_SHA256 = re.compile(r"^[a-f0-9]{64}$")


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        raise ValueError("Datetime values must be timezone-aware")
    return value.astimezone(timezone.utc)


def _safe_metadata(metadata: dict[str, Any]) -> dict[str, str | int | float | bool | None]:
    if not isinstance(metadata, dict) or len(metadata) > 32:
        raise ValueError("Audit metadata must be an object with at most 32 fields")
    result: dict[str, str | int | float | bool | None] = {}
    for key, value in metadata.items():
        if not isinstance(key, str) or _SECRET_KEY.search(key):
            raise ValueError("Sensitive audit metadata keys are not permitted")
        if not isinstance(value, (str, int, float, bool, type(None))):
            raise ValueError("Audit metadata values must be scalar")
        if isinstance(value, str) and len(value) > 500:
            raise ValueError("Audit metadata strings are limited to 500 characters")
        result[key] = value
    return result


def _event_digest(fields: dict[str, Any]) -> str:
    canonical = json.dumps(
        fields, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


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
) -> AuditEvent:
    """Append one event under a row lock; caller owns commit/rollback."""
    if not stream_id or len(stream_id) > 200:
        raise ValueError("stream_id must contain 1..200 characters")
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
        # Concurrent first writers are serialized by the composite primary key.
        # A uniqueness conflict aborts this transaction; callers may retry it.
        session.flush()

    occurred = _utc(created_at or datetime.now(timezone.utc))
    safe_metadata = _safe_metadata(metadata or {})
    sequence = head.sequence + 1
    identifier = event_id or str(uuid4())
    previous = head.last_digest
    digest_fields = {
        "event_id": identifier,
        "tenant_id": tenant_id,
        "stream_id": stream_id,
        "sequence": sequence,
        "created_at": occurred.isoformat(),
        "actor": actor,
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "outcome": outcome,
        "correlation_id": correlation_id,
        "metadata": safe_metadata,
        "previous_digest": previous,
    }
    digest = _event_digest(digest_fields)
    event = AuditEvent(
        event_id=identifier,
        tenant_id=tenant_id,
        stream_id=stream_id,
        sequence=sequence,
        created_at=occurred,
        actor=actor,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        outcome=outcome,
        correlation_id=correlation_id,
        metadata_json=safe_metadata,
        previous_digest=previous,
        digest=digest,
    )
    session.add(event)
    head.sequence = sequence
    head.last_digest = digest
    session.flush()
    return event


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

    Signature/authorization verification is deliberately outside this function.
    The raw nonce is hashed and never stored. Duplicate nonce insertion raises
    IntegrityError; the outer transaction must be rolled back by the caller.
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
