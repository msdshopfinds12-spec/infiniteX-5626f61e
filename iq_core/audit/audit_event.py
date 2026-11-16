"""Immutable, hash-linked audit events with bounded, non-sensitive metadata."""

from __future__ import annotations

import hashlib
import json
import math
import re
from dataclasses import dataclass
from types import MappingProxyType
from typing import Mapping


_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
_IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,127}$")
_SENSITIVE_KEY_PARTS = (
    "access_token",
    "api_key",
    "apikey",
    "authorization",
    "cookie",
    "credential",
    "password",
    "private_key",
    "refresh_token",
    "secret",
    "session",
    "token",
)
_MAX_METADATA_ITEMS = 64
_MAX_METADATA_VALUE_LENGTH = 256
_MAX_METADATA_BYTES = 8192


class AuditIntegrityError(ValueError):
    """Raised when an audit event or chain fails integrity verification."""


def _validate_identifier(name: str, value: str) -> None:
    if not isinstance(value, str) or not _IDENTIFIER_RE.fullmatch(value):
        raise ValueError(f"AUDIT_{name.upper()}_INVALID")


def _canonical_metadata(metadata: Mapping[str, object] | None) -> dict[str, object]:
    if metadata is None:
        return {}
    if not isinstance(metadata, Mapping) or len(metadata) > _MAX_METADATA_ITEMS:
        raise ValueError("AUDIT_METADATA_VALUE_INVALID")

    result: dict[str, object] = {}
    for key, value in metadata.items():
        if not isinstance(key, str) or not key or len(key) > 80:
            raise ValueError("AUDIT_METADATA_VALUE_INVALID")
        normalized_key = key.casefold().replace("-", "_")
        if any(part in normalized_key for part in _SENSITIVE_KEY_PARTS):
            raise ValueError("AUDIT_SENSITIVE_METADATA_KEY_REJECTED")
        if isinstance(value, str):
            if len(value) > _MAX_METADATA_VALUE_LENGTH:
                raise ValueError("AUDIT_METADATA_VALUE_TOO_LONG")
        elif isinstance(value, float):
            if not math.isfinite(value):
                raise ValueError("AUDIT_METADATA_VALUE_INVALID")
        elif value is not None and not isinstance(value, (bool, int)):
            raise ValueError("AUDIT_METADATA_VALUE_INVALID")
        result[key] = value

    encoded = json.dumps(
        result,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")
    if len(encoded) > _MAX_METADATA_BYTES:
        raise ValueError("AUDIT_METADATA_VALUE_TOO_LONG")
    return result


def _event_payload(
    *,
    event_id: str,
    stream_id: str,
    occurred_at: int,
    actor_id: str,
    action: str,
    resource_type: str,
    resource_id: str,
    outcome: str,
    correlation_id: str,
    metadata: Mapping[str, object],
    previous_event_sha256: str | None,
) -> dict[str, object]:
    return {
        "action": action,
        "actor_id": actor_id,
        "correlation_id": correlation_id,
        "event_id": event_id,
        "metadata": dict(metadata),
        "occurred_at": occurred_at,
        "outcome": outcome,
        "previous_event_sha256": previous_event_sha256,
        "resource_id": resource_id,
        "resource_type": resource_type,
        "stream_id": stream_id,
    }


@dataclass(frozen=True, slots=True)
class AuditEvent:
    """An immutable audit record whose digest covers every persisted field."""

    event_id: str
    stream_id: str
    occurred_at: int
    actor_id: str
    action: str
    resource_type: str
    resource_id: str
    outcome: str
    correlation_id: str
    metadata: Mapping[str, object]
    previous_event_sha256: str | None
    event_sha256: str

    @classmethod
    def create(
        cls,
        *,
        stream_id: str,
        occurred_at: int,
        actor_id: str,
        action: str,
        resource_type: str,
        resource_id: str,
        outcome: str,
        correlation_id: str,
        metadata: Mapping[str, object] | None = None,
        event_id: str,
        previous_event_sha256: str | None = None,
    ) -> AuditEvent:
        for name, value in (
            ("event_id", event_id),
            ("stream_id", stream_id),
            ("actor_id", actor_id),
            ("action", action),
            ("resource_type", resource_type),
            ("resource_id", resource_id),
            ("outcome", outcome),
            ("correlation_id", correlation_id),
        ):
            _validate_identifier(name, value)
        if isinstance(occurred_at, bool) or not isinstance(occurred_at, int) or occurred_at < 0:
            raise ValueError("AUDIT_OCCURRED_AT_INVALID")
        if previous_event_sha256 is not None and not _SHA256_RE.fullmatch(
            previous_event_sha256
        ):
            raise ValueError("AUDIT_PREVIOUS_HASH_INVALID")

        safe_metadata = _canonical_metadata(metadata)
        payload = _event_payload(
            event_id=event_id,
            stream_id=stream_id,
            occurred_at=occurred_at,
            actor_id=actor_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            outcome=outcome,
            correlation_id=correlation_id,
            metadata=safe_metadata,
            previous_event_sha256=previous_event_sha256,
        )
        canonical = json.dumps(
            payload,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        ).encode("utf-8")
        digest = hashlib.sha256(canonical).hexdigest()
        return cls(
            event_id=event_id,
            stream_id=stream_id,
            occurred_at=occurred_at,
            actor_id=actor_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            outcome=outcome,
            correlation_id=correlation_id,
            metadata=MappingProxyType(safe_metadata),
            previous_event_sha256=previous_event_sha256,
            event_sha256=digest,
        )


def append_audit_event(*, event: AuditEvent, store: object) -> None:
    """Append a trusted event; stores must atomically enforce event uniqueness."""
    if not isinstance(event, AuditEvent):
        raise TypeError("TRUSTED_AUDIT_EVENT_REQUIRED")
    append = getattr(store, "append", None)
    if not callable(append):
        raise TypeError("AUDIT_STORE_APPEND_REQUIRED")
    if append(event=event) is not True:
        raise ValueError("AUDIT_EVENT_REPLAY_DETECTED")


def verify_audit_event(*, event: AuditEvent) -> None:
    """Recompute the event digest; never trust the stored digest field."""
    if not isinstance(event, AuditEvent):
        raise TypeError("TRUSTED_AUDIT_EVENT_REQUIRED")
    expected = AuditEvent.create(
        event_id=event.event_id,
        stream_id=event.stream_id,
        occurred_at=event.occurred_at,
        actor_id=event.actor_id,
        action=event.action,
        resource_type=event.resource_type,
        resource_id=event.resource_id,
        outcome=event.outcome,
        correlation_id=event.correlation_id,
        metadata=dict(event.metadata),
        previous_event_sha256=event.previous_event_sha256,
    )
    if expected.event_sha256 != event.event_sha256:
        raise AuditIntegrityError("AUDIT_EVENT_DIGEST_MISMATCH")


def verify_audit_chain(*, events: tuple[AuditEvent, ...] | list[AuditEvent]) -> str | None:
    """Verify an ordered, single-stream chain and return its final digest.

    An empty chain is valid and returns None. Callers must supply events in
    persisted sequence order; storage must enforce that order transactionally.
    """
    if not isinstance(events, (tuple, list)):
        raise TypeError("AUDIT_EVENT_SEQUENCE_REQUIRED")
    if not events:
        return None
    if not isinstance(events[0], AuditEvent):
        raise TypeError("TRUSTED_AUDIT_EVENT_REQUIRED")
    stream_id = events[0].stream_id
    previous_digest: str | None = None
    seen_event_ids: set[str] = set()
    for index, event in enumerate(events):
        if not isinstance(event, AuditEvent):
            raise TypeError("TRUSTED_AUDIT_EVENT_REQUIRED")
        if event.previous_event_sha256 != previous_digest:
            code = "AUDIT_CHAIN_ROOT_INVALID" if index == 0 else "AUDIT_CHAIN_LINK_INVALID"
            raise AuditIntegrityError(code)
        verify_audit_event(event=event)
        if event.stream_id != stream_id:
            raise AuditIntegrityError("AUDIT_STREAM_MISMATCH")
        if event.event_id in seen_event_ids:
            raise AuditIntegrityError("AUDIT_DUPLICATE_EVENT_ID")
        seen_event_ids.add(event.event_id)
        previous_digest = event.event_sha256
    return previous_digest
