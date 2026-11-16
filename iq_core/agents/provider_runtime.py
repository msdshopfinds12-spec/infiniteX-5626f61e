"""Provider-neutral, zero-network inference boundary for InfiniteX.

The runtime deliberately ships with a deterministic mock adapter only.
It does not claim to be an LLM and does not make outbound requests. A real
adapter must be registered explicitly and pass ProviderPolicy before use.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from iq_core.agents.provider_policy import ProviderPolicy, PolicyDecision


class ProviderRuntimeError(RuntimeError):
    """Controlled failure raised before any unapproved provider invocation."""


@dataclass(frozen=True)
class InferenceRequest:
    request_id: str
    tenant_id: str
    purpose: str
    prompt: str
    provider_id: str = "mock"
    model_id: str = "mock"
    max_output_chars: int = 2_000


@dataclass(frozen=True)
class InferenceResult:
    request_id: str
    provider_id: str
    model_id: str
    output: str
    cost_usd: str
    is_mock: bool


class InferenceProvider(Protocol):
    provider_id: str
    model_id: str

    def generate(self, request: InferenceRequest) -> InferenceResult:
        """Generate a result. Implementations must never bypass policy routing."""


class MockInferenceProvider:
    """Deterministic local adapter for wiring and tests; not an AI model."""

    provider_id = "mock"
    model_id = "mock"

    def generate(self, request: InferenceRequest) -> InferenceResult:
        output = (
            "MOCK_PROVIDER_ONLY: no language model was called. "
            f"Request accepted for purpose={request.purpose!r}."
        )
        return InferenceResult(
            request_id=request.request_id,
            provider_id=self.provider_id,
            model_id=self.model_id,
            output=output[: request.max_output_chars],
            cost_usd="0.00",
            is_mock=True,
        )


class InferenceRouter:
    """Fail-closed router. Unknown, unregistered, or unapproved models are denied."""

    def __init__(
        self,
        *,
        policy: ProviderPolicy | None = None,
        providers: tuple[InferenceProvider, ...] | None = None,
    ) -> None:
        self._policy = policy or ProviderPolicy()
        adapters = providers if providers is not None else (MockInferenceProvider(),)
        self._providers: dict[tuple[str, str], InferenceProvider] = {}
        for adapter in adapters:
            key = (adapter.provider_id, adapter.model_id)
            if key in self._providers:
                raise ValueError(f"Duplicate inference adapter registration: {key!r}")
            self._providers[key] = adapter

    def generate(self, request: InferenceRequest) -> InferenceResult:
        self._validate_request(request)
        decision: PolicyDecision = self._policy.authorize(
            provider_id=request.provider_id,
            model_id=request.model_id,
            estimated_cost_usd="0.00",
            paid_fallback_requested=False,
        )
        if not decision.allowed:
            raise ProviderRuntimeError(f"{decision.reason_code}: {decision.message}")

        adapter = self._providers.get((request.provider_id, request.model_id))
        if adapter is None:
            raise ProviderRuntimeError("PROVIDER_ADAPTER_NOT_REGISTERED")

        result = adapter.generate(request)
        if (
            result.request_id != request.request_id
            or result.provider_id != request.provider_id
            or result.model_id != request.model_id
            or result.cost_usd != "0.00"
        ):
            raise ProviderRuntimeError("PROVIDER_RESULT_INTEGRITY_CHECK_FAILED")
        return result

    @staticmethod
    def _validate_request(request: InferenceRequest) -> None:
        if not isinstance(request, InferenceRequest):
            raise TypeError("request must be an InferenceRequest")
        for name, value in (
            ("request_id", request.request_id),
            ("tenant_id", request.tenant_id),
            ("purpose", request.purpose),
            ("prompt", request.prompt),
        ):
            if not isinstance(value, str) or not value.strip():
                raise ValueError(f"{name} is required")
        if len(request.prompt) > 20_000:
            raise ValueError("prompt exceeds the 20000-character safety limit")
        if (
            isinstance(request.max_output_chars, bool)
            or not isinstance(request.max_output_chars, int)
            or not 1 <= request.max_output_chars <= 8_000
        ):
            raise ValueError("max_output_chars must be between 1 and 8000")


DEFAULT_INFERENCE_ROUTER = InferenceRouter()
