"""Immutable, privacy-conscious audit event contract.

This module defines an event envelope and persistence port. Durable append-only
storage requires a database transaction, serialized per-stream append, and
independently protected backups.
"""
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from typing import Protocol
from uuid import uuid4

_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
_SENSITIVE_KEY_PARTS = (
    "authorization", "cookie", "password", "passwd", "secret", "token",
    "private_key", "credential", "api_key", "access_key",
)


def _validate_identifier(value: str, field: str) -> None:
    if not isinstance(value, str) or not _ID_RE.fullmatch(value):
        raise ValueError(f"AUDIT_{field.upper()}_INVALID")


def _canonical_json(value: object) -> bytes:
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")


def _validate_metadata(metadata: dict[str, str | int | bool | None]) -> None:
    if not isinstance(metadata, dict) or len(metadata) > 32:
        raise ValueError("AUDIT_METADATA_INVALID")
    for key, value in metadata.items():
        _validate_identifier(key, "metadata_key")
        if any(part in key.lower() for part in _SENSITIVE_KEY_PARTS):
            raise ValueError("AUDIT_SENSITIVE_METADATA_KEY_REJECTED")
        if value is not None and not isinstance(value, (str, int, bool)):
            raise ValueError("AUDIT_METADATA_VALUE_INVALID")
        if isinstance(value, str) and len(value) > 256:
            raise ValueError("AUDIT_METADATA_VALUE_TOO_LONG")
        if isinstance(value, int) and not isinstance(value, bool) and abs(value) > 2**63 - 1:
            raise ValueError("AUDIT_METADATA_INTEGER_OUT_OF_RANGE")


@dataclass(frozen=True)
class AuditEvent:
    event_id: str
    stream_id: str
    occurred_at: int
    actor_id: str
    action: str
    resource_type: str
    resource_id: str
    outcome: str
    correlation_id: str
    metadata: tuple[tuple[str, str | int | bool | None], ...]
    previous_event_sha256: str | None
    event_sha256: str

    @classmethod
    def create(
        cls, *, stream_id: str, occurred_at: int, actor_id: str,
        action: str, resource_type: str, resource_id: str, outcome: str,
        correlation_id: str,
        metadata: dict[str, str | int | bool | None] | None = None,
        previous_event_sha256: str | None = None,
        event_id: str | None = None,
    ) -> "AuditEvent":
        values = {
            "stream_id": stream_id, "actor_id": actor_id, "action": action,
            "resource_type": resource_type, "resource_id": resource_id,
            "outcome": outcome, "correlation_id": correlation_id,
        }
        for field, value in values.items():
            _validate_identifier(value, field)
        if isinstance(occurred_at, bool) or not isinstance(occurred_at, int) or occurred_at < 0:
            raise ValueError("AUDIT_TIMESTAMP_INVALID")
        if previous_event_sha256 is not None and not _SHA256_RE.fullmatch(previous_event_sha256):
            raise ValueError("AUDIT_PREVIOUS_HASH_INVALID")
        event_id = event_id or str(uuid4())
        _validate_identifier(event_id, "event_id")
        metadata = metadata or {}
        _validate_metadata(metadata)
        frozen_metadata = tuple(sorted(metadata.items()))
        body = {
            "event_id": event_id, "stream_id": stream_id,
            "occurred_at": occurred_at, "actor_id": actor_id,
            "action": action, "resource_type": resource_type,
            "resource_id": resource_id, "outcome": outcome,
            "correlation_id": correlation_id,
            "metadata": list(frozen_metadata),
            "previous_event_sha256": previous_event_sha256,
        }
        digest = hashlib.sha256(_canonical_json(body)).hexdigest()
        return cls(
            event_id=event_id, stream_id=stream_id, occurred_at=occurred_at,
            actor_id=actor_id, action=action, resource_type=resource_type,
            resource_id=resource_id, outcome=outcome,
            correlation_id=correlation_id, metadata=frozen_metadata,
            previous_event_sha256=previous_event_sha256, event_sha256=digest,
        )


class AuditEventStore(Protocol):
    """Append-only persistence port with atomic per-stream ordering."""

    def append(self, *, event: AuditEvent) -> bool:
        """Append once, atomically enforcing stream order and event-ID uniqueness.

        Return False for a duplicate event ID. Serialize concurrent appends,
        verify previous_event_sha256 against the persisted tail, and commit the
        event plus updated stream head in one transaction. Deny updates/deletes.
        """
        ...


def append_audit_event(*, event: AuditEvent, store: AuditEventStore) -> None:
    if not isinstance(event, AuditEvent):
        raise TypeError("TRUSTED_AUDIT_EVENT_REQUIRED")
    if not store.append(event=event):
        raise ValueError("AUDIT_EVENT_REPLAY_DETECTED")
