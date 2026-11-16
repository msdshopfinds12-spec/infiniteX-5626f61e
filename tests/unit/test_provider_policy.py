from datetime import datetime, timedelta, timezone
from decimal import Decimal

from iq_core.agents.provider_policy import (
    DEFAULT_PROVIDER_POLICY,
    FreeModelApproval,
    ProviderPolicy,
)


NOW = datetime(2026, 11, 17, tzinfo=timezone.utc)


def approval(**overrides):
    values = {
        "provider_id": "cloudflare-workers-ai",
        "model_id": "@cf/example/free-model",
        "verified_at": NOW - timedelta(hours=1),
        "expires_at": NOW + timedelta(days=1),
        "account_eligible": True,
        "data_policy_approved": True,
    }
    values.update(overrides)
    return FreeModelApproval(**values)


def test_default_policy_disables_all_external_models():
    decision = DEFAULT_PROVIDER_POLICY.authorize(
        provider_id="cloudflare-workers-ai",
        model_id="@cf/example/free-model",
        now=NOW,
        quota_remaining=10,
    )
    assert not decision.allowed
    assert decision.reason_code == "MODEL_NOT_ALLOWLISTED"


def test_mock_mode_is_allowed_without_network_provider():
    decision = DEFAULT_PROVIDER_POLICY.authorize(
        provider_id="mock", model_id="mock", now=NOW
    )
    assert decision.allowed
    assert decision.reason_code == "MOCK_ALLOWED"


def test_exact_approved_model_is_allowed_only_with_free_quota():
    key = ("cloudflare-workers-ai", "@cf/example/free-model")
    policy = ProviderPolicy({key: approval()})
    decision = policy.authorize(
        provider_id=key[0], model_id=key[1], now=NOW, quota_remaining=1
    )
    assert decision.allowed


def test_unknown_or_different_model_is_denied():
    policy = ProviderPolicy({("cloudflare-workers-ai", "@cf/example/free-model"): approval()})
    decision = policy.authorize(
        provider_id="cloudflare-workers-ai",
        model_id="@cf/example/paid-model",
        now=NOW,
        quota_remaining=1,
    )
    assert not decision.allowed
    assert decision.reason_code == "MODEL_NOT_ALLOWLISTED"


def test_expired_free_tier_evidence_is_denied():
    key = ("cloudflare-workers-ai", "@cf/example/free-model")
    policy = ProviderPolicy({key: approval(expires_at=NOW - timedelta(seconds=1))})
    decision = policy.authorize(
        provider_id=key[0], model_id=key[1], now=NOW, quota_remaining=1
    )
    assert not decision.allowed
    assert decision.reason_code == "FREE_TIER_EVIDENCE_EXPIRED"


def test_unknown_or_exhausted_quota_is_denied():
    key = ("cloudflare-workers-ai", "@cf/example/free-model")
    policy = ProviderPolicy({key: approval()})
    for remaining in (None, 0, -1):
        decision = policy.authorize(
            provider_id=key[0], model_id=key[1], now=NOW, quota_remaining=remaining
        )
        assert not decision.allowed
        assert decision.reason_code == "FREE_QUOTA_UNAVAILABLE"


def test_nonzero_cost_is_denied():
    key = ("cloudflare-workers-ai", "@cf/example/free-model")
    policy = ProviderPolicy({key: approval()})
    decision = policy.authorize(
        provider_id=key[0], model_id=key[1], now=NOW, quota_remaining=10,
        estimated_cost_usd=Decimal("0.0001"),
    )
    assert not decision.allowed
    assert decision.reason_code == "NONZERO_COST"


def test_paid_fallback_is_always_denied():
    key = ("cloudflare-workers-ai", "@cf/example/free-model")
    policy = ProviderPolicy({key: approval()})
    decision = policy.authorize(
        provider_id=key[0], model_id=key[1], now=NOW, quota_remaining=10,
        paid_fallback_requested=True,
    )
    assert not decision.allowed
    assert decision.reason_code == "PAID_FALLBACK_FORBIDDEN"


def test_unapproved_data_terms_and_ineligible_account_are_denied():
    key = ("cloudflare-workers-ai", "@cf/example/free-model")
    for record, expected in (
        (approval(account_eligible=False), "ACCOUNT_NOT_ELIGIBLE"),
        (approval(data_policy_approved=False), "DATA_POLICY_NOT_APPROVED"),
    ):
        policy = ProviderPolicy({key: record})
        decision = policy.authorize(
            provider_id=key[0], model_id=key[1], now=NOW, quota_remaining=10
        )
        assert not decision.allowed
        assert decision.reason_code == expected
