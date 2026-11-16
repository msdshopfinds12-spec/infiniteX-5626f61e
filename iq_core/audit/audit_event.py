class AuditIntegrityError(ValueError):
    """Raised when an audit event or chain fails integrity verification."""


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
    stream_id = events[0].stream_id
    previous_digest: str | None = None
    seen_event_ids: set[str] = set()
    for index, event in enumerate(events):
        if not isinstance(event, AuditEvent):
            raise TypeError("TRUSTED_AUDIT_EVENT_REQUIRED")
        # Check chain topology before digest validation so a broken link receives
        # its precise integrity error instead of being reported as a generic digest
        # mismatch. Both conditions remain fail-closed.
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
