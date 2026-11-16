from dataclasses import FrozenInstanceError

import pytest

from iq_core.agents.approval_apply_intent import (
    ApprovalApplyIntent,
    persist_verified_apply_intent,
)
from iq_core.agents.approval_contract import ApprovalClaims


def verified_claims(**overrides):
    values = {
        "iss": "approval-service",
        "aud": "infinitegx-approval",
        "jti": "nonce-unique-001",
        "sub": "reviewer-001",
        "reviewer_role": "owner",
        "repository_id": "repo-001",
        "target_branch": "fix/infiniteX-foundation-hardening",
        "base_commit_sha": "a" * 40,
        "proposal_id": "proposal-001",
        "proposal_sha256": "b" * 64,
        "file_paths": ("backend/app/example.py",),
        "policy_version": "policy-v1",
        "schema_version": 1,
        "iat": 1_900_000_000,
        "nbf": 1_900_000_000,
        "exp": 1_900_000_120,
    }
    values.update(overrides)
    return ApprovalClaims(**values)


class FakeAtomicIntentStore:
    """Test double only; not a production persistence implementation."""

    def __init__(self):
        self.intents = {}

    def record_once(self, *, intent):
        if intent.nonce_id in self.intents:
            return False
        self.intents[intent.nonce_id] = intent
        return True


def test_persists_exact_verified_scope_once():
    store = FakeAtomicIntentStore()
    claims = verified_claims()

    intent = persist_verified_apply_intent(claims=claims, store=store)

    assert intent == ApprovalApplyIntent.from_verified_claims(claims)
    assert store.intents[claims.jti] is intent
    assert intent.file_paths == claims.file_paths


def test_rejects_replayed_nonce():
    store = FakeAtomicIntentStore()
    claims = verified_claims()
    persist_verified_apply_intent(claims=claims, store=store)

    with pytest.raises(ValueError, match="APPROVAL_REPLAY_DETECTED"):
        persist_verified_apply_intent(claims=claims, store=store)


def test_apply_intent_is_immutable():
    intent = ApprovalApplyIntent.from_verified_claims(verified_claims())

    with pytest.raises(FrozenInstanceError):
        intent.target_branch = "main"


def test_unverified_arbitrary_payload_is_not_accepted():
    with pytest.raises(TypeError, match="verified ApprovalClaims"):
        ApprovalApplyIntent.from_verified_claims({"sub": "attacker"})


def test_store_failure_propagates_without_claiming_success():
    class FailingStore:
        def record_once(self, *, intent):
            raise RuntimeError("database unavailable")

    with pytest.raises(RuntimeError, match="database unavailable"):
        persist_verified_apply_intent(
            claims=verified_claims(), store=FailingStore()
        )
