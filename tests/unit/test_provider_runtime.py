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
    assert result.matched_terms == ("bug", "test", "api", "database")
    assert result.generative is False


def test_local_rules_engine_returns_unknown_without_matching_terms():
    result = LocalRulesEngine().classify("hello there")

    assert result.category == "unknown"
    assert result.matched_terms == ()


def test_request_rejects_non_string_prompt_and_purpose():
    with pytest.raises(ValueError, match="purpose"):
        InferenceRequest(purpose=123, prompt="ok")
    with pytest.raises(ValueError, match="prompt"):
        InferenceRequest(purpose="test", prompt=object())


def test_request_rejects_boolean_token_limit_and_invalid_tenant():
    with pytest.raises(ValueError, match="max_output_tokens"):
        InferenceRequest(purpose="test", prompt="ok", max_output_tokens=True)
    with pytest.raises(ValueError, match="tenant_id"):
        InferenceRequest(purpose="test", prompt="ok", tenant_id=" ")


def test_request_normalizes_request_id_whitespace():
    request = InferenceRequest(
        purpose="test", prompt="ok", request_id="  req-123  "
    )
    assert request.request_id == "req-123"


def test_runtime_rejects_mismatched_adapter_registry_identity():
    class WrongAdapter:
        provider_id = "different"

        def supports(self, model_id):
            return model_id == "mock"

        def complete(self, request, model_id):
            return "unexpected"

    with pytest.raises(ValueError, match="must match"):
        from iq_core.providers.runtime import ProviderRuntime
        ProviderRuntime(adapters={"mock": WrongAdapter()})


def test_runtime_rejects_model_identifier_with_surrounding_whitespace():
    runtime = build_mock_runtime()
    request = InferenceRequest(purpose="test", prompt="synthetic")
    with pytest.raises(ProviderDenied, match="EXACT_MODEL_ID_REQUIRED"):
        runtime.complete(request, provider_id="mock", model_id=" mock ")


def test_runtime_rejects_non_request_objects_before_policy_or_adapter():
    runtime = build_mock_runtime()
    with pytest.raises(TypeError, match="InferenceRequest"):
        runtime.complete(object(), provider_id="mock", model_id="mock")


def test_adapter_failure_is_redacted_to_stable_error_code():
    from iq_core.providers.runtime import MockAdapter, ProviderRuntime

    class FailingAdapter(MockAdapter):
        def complete(self, request, model_id):
            raise RuntimeError("sensitive provider detail")

    runtime = ProviderRuntime(adapters={"mock": FailingAdapter()})
    request = InferenceRequest(purpose="test", prompt="synthetic")
    with pytest.raises(ProviderDenied, match="PROVIDER_EXECUTION_FAILED") as error:
        runtime.complete(request, provider_id="mock", model_id="mock")
    assert "sensitive provider detail" not in str(error.value)


def test_runtime_rejects_oversized_adapter_output():
    from iq_core.providers.runtime import MockAdapter, ProviderRuntime

    class OversizedAdapter(MockAdapter):
        def complete(self, request, model_id):
            return "x" * (ProviderRuntime.MAX_OUTPUT_CHARS + 1)

    runtime = ProviderRuntime(adapters={"mock": OversizedAdapter()})
    request = InferenceRequest(purpose="test", prompt="synthetic")
    with pytest.raises(ProviderDenied, match="PROVIDER_OUTPUT_TOO_LARGE"):
        runtime.complete(request, provider_id="mock", model_id="mock")
