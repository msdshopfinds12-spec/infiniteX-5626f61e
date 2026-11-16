"""Fail-closed inference runtime with no implicit provider fallback."""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol

from iq_core.agents.provider_policy import DEFAULT_PROVIDER_POLICY, ProviderPolicy
from iq_core.providers.contracts import InferenceRequest, InferenceResult


class ProviderDenied(RuntimeError):
    """Raised when policy or adapter availability blocks inference."""

    def __init__(self, reason_code: str) -> None:
        self.reason_code = reason_code
        super().__init__(reason_code)


class InferenceAdapter(Protocol):
    provider_id: str

    def supports(self, model_id: str) -> bool:
        """Return whether this adapter implements the exact model identifier."""

    def complete(self, request: InferenceRequest, model_id: str) -> str:
        """Execute a bounded inference request."""


@dataclass(frozen=True)
class MockAdapter:
    """Deterministic test adapter. It does not call an AI model or network."""

    provider_id: str = "mock"

    def supports(self, model_id: str) -> bool:
        return model_id == "mock"

    def complete(self, request: InferenceRequest, model_id: str) -> str:
        del model_id
        return (
            "MOCK_ONLY: no model inference was performed. "
            f"Accepted purpose: {request.purpose}. "
            f"Request ID: {request.request_id}."
        )


class ProviderRuntime:
    """Central policy enforcement point for any future inference adapters.

    External adapters are absent from the default registry. A caller cannot
    activate a provider merely by supplying its name or model ID.
    """

    def __init__(
        self,
        *,
        adapters: dict[str, InferenceAdapter] | None = None,
        policy: ProviderPolicy = DEFAULT_PROVIDER_POLICY,
    ) -> None:
        self._adapters = dict(adapters or {})
        self._policy = policy

    def complete(
        self,
        request: InferenceRequest,
        *,
        provider_id: str,
        model_id: str,
        quota_remaining: int | None = None,
        estimated_cost_usd: Decimal | str = Decimal("0.00"),
        paid_fallback_requested: bool = False,
    ) -> InferenceResult:
        decision = self._policy.authorize(
            provider_id=provider_id,
            model_id=model_id,
            quota_remaining=quota_remaining,
            estimated_cost_usd=estimated_cost_usd,
            paid_fallback_requested=paid_fallback_requested,
        )
        if not decision.allowed:
            raise ProviderDenied(decision.reason_code)

        normalized_provider_id = provider_id.strip().lower()
        adapter = self._adapters.get(normalized_provider_id)
        if adapter is None:
            raise ProviderDenied("PROVIDER_ADAPTER_NOT_REGISTERED")
        if not adapter.supports(model_id):
            raise ProviderDenied("MODEL_NOT_SUPPORTED_BY_ADAPTER")

        output = adapter.complete(request, model_id)
        if not isinstance(output, str) or not output.strip():
            raise ProviderDenied("PROVIDER_RETURNED_EMPTY_OUTPUT")

        return InferenceResult(
            request_id=request.request_id,
            provider_id=normalized_provider_id,
            model_id=model_id,
            output=output,
            policy_reason_code=decision.reason_code,
            estimated_cost_usd="0.00",
            execution_mode="MOCK" if normalized_provider_id == "mock" else "EXTERNAL",
        )


def build_mock_runtime() -> ProviderRuntime:
    """Build the only enabled default runtime: deterministic mock, no network."""
    return ProviderRuntime(adapters={"mock": MockAdapter()})
