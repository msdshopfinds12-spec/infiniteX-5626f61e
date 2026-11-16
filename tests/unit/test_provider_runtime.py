from decimal import Decimal

import pytest

from iq_core.providers import InferenceRequest, ProviderDenied, build_mock_runtime
from iq_core.providers.local_rules import LocalRulesEngine


def test_mock_runtime_is_deterministic_and_explicitly_not_an_llm():
    runtime = build_mock_runtime()
    request = InferenceRequest(purpose="test", prompt="synthetic test prompt")

    result = runtime.complete(request, provider_id="mock", model_id="mock")

    assert result.execution_mode == "MOCK"
    assert result.estimated_cost_usd == "0.00"
    assert "no model inference was performed" in result.output
    assert result.request_id == request.request_id


@pytest.mark.parametrize(
    ("provider_id", "model_id"),
    [
        ("openai", "gpt-6"),
        ("anthropic", "claude-sonnet"),
        ("openrouter", "some-free-model"),
        ("unknown-provider", "unknown-model"),
    ],
)
def test_external_providers_are_denied_by_default(provider_id, model_id):
    runtime = build_mock_runtime()
    request = InferenceRequest(purpose="test", prompt="synthetic")

    with pytest.raises(ProviderDenied):
        runtime.complete(request, provider_id=provider_id, model_id=model_id)


def test_paid_fallback_is_always_denied():
    runtime = build_mock_runtime()
    request = InferenceRequest(purpose="test", prompt="synthetic")

    with pytest.raises(ProviderDenied, match="PAID_FALLBACK_FORBIDDEN"):
        runtime.complete(
            request,
            provider_id="mock",
            model_id="mock",
            paid_fallback_requested=True,
        )


def test_nonzero_estimated_cost_is_denied():
    runtime = build_mock_runtime()
    request = InferenceRequest(purpose="test", prompt="synthetic")

    with pytest.raises(ProviderDenied, match="NONZERO_COST"):
        runtime.complete(
            request,
            provider_id="mock",
            model_id="mock",
            estimated_cost_usd=Decimal("0.01"),
        )


@pytest.mark.parametrize(
    "kwargs",
    [
        {"purpose": "", "prompt": "ok"},
        {"purpose": "test", "prompt": " "},
        {"purpose": "test", "prompt": "x", "max_output_tokens": 0},
        {"purpose": "test", "prompt": "x", "max_output_tokens": 4097},
    ],
)
def test_request_validation(kwargs):
    with pytest.raises(ValueError):
        InferenceRequest(**kwargs)


def test_local_rules_engine_is_deterministic_and_not_generative():
    result = LocalRulesEngine().classify("Please test the API and fix this database bug")

    assert result.category == "engineering"
    assert result.matched_terms == ("test", "api", "database", "bug")
    assert result.generative is False


def test_local_rules_engine_returns_unknown_without_matching_terms():
    result = LocalRulesEngine().classify("hello there")

    assert result.category == "unknown"
    assert result.matched_terms == ()
