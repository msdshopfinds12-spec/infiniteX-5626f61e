from dataclasses import FrozenInstanceError

import pytest

from iq_core.audit.audit_event import AuditEvent, append_audit_event


def make_event(**overrides):
    values = {
        "stream_id": "approval-stream",
        "occurred_at": 1_800_000_000,
        "actor_id": "reviewer-123",
        "action": "approval.verified",
        "resource_type": "proposal",
        "resource_id": "proposal-123",
        "outcome": "accepted",
        "correlation_id": "request-123",
        "metadata": {"branch": "fix/infiniteX-foundation-hardening", "file_count": 2},
        "event_id": "event-123",
    }
    values.update(overrides)
    return AuditEvent.create(**values)


def test_event_is_deterministic_for_same_canonical_input():
    assert make_event() == make_event()
    assert make_event().event_sha256 == make_event().event_sha256


def test_metadata_order_does_not_change_hash():
    left = make_event(metadata={"branch": "feature/x", "count": 2})
    right = make_event(metadata={"count": 2, "branch": "feature/x"})
    assert left.event_sha256 == right.event_sha256


def test_previous_hash_links_event_chain():
    previous = "a" * 64
    event = make_event(previous_event_sha256=previous)
    assert event.previous_event_sha256 == previous
    assert event.event_sha256 != make_event().event_sha256


def test_sensitive_metadata_keys_are_rejected():
    with pytest.raises(ValueError, match="AUDIT_SENSITIVE_METADATA_KEY_REJECTED"):
        make_event(metadata={"access_token": "do-not-store"})


def test_oversized_or_complex_metadata_is_rejected():
    with pytest.raises(ValueError, match="AUDIT_METADATA_VALUE_TOO_LONG"):
        make_event(metadata={"description": "x" * 257})
    with pytest.raises(ValueError, match="AUDIT_METADATA_VALUE_INVALID"):
        make_event(metadata={"nested": {"secret": "value"}})


def test_invalid_previous_hash_is_rejected():
    with pytest.raises(ValueError, match="AUDIT_PREVIOUS_HASH_INVALID"):
        make_event(previous_event_sha256="not-a-hash")


def test_event_is_immutable():
    event = make_event()
    with pytest.raises(FrozenInstanceError):
        event.outcome = "changed"


def test_store_replay_is_rejected():
    class DuplicateStore:
        def append(self, *, event):
            return False

    with pytest.raises(ValueError, match="AUDIT_EVENT_REPLAY_DETECTED"):
        append_audit_event(event=make_event(), store=DuplicateStore())


def test_untrusted_event_is_rejected():
    class AcceptingStore:
        def append(self, *, event):
            return True

    with pytest.raises(TypeError, match="TRUSTED_AUDIT_EVENT_REQUIRED"):
        append_audit_event(event={"actor_id": "attacker"}, store=AcceptingStore())
