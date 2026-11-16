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
    activate a provider merely by supplying its name or model ID. The quota
    argument is an admission snapshot only; real providers additionally require
    an atomic quota reservation/settlement service before network activation.
    """

    MAX_OUTPUT_CHARS = 64_000

    def __init__(
        self,
        *,
        adapters: dict[str, InferenceAdapter] | None = None,
        policy: ProviderPolicy = DEFAULT_PROVIDER_POLICY,
    ) -> None:
        self._adapters: dict[str, InferenceAdapter] = {}
        self._policy = policy
        for key, adapter in (adapters or {}).items():
            if not isinstance(key, str) or not key.strip():
                raise ValueError("Adapter registry keys must be non-empty strings")
            if not isinstance(getattr(adapter, "provider_id", None), str):
                raise ValueError("Adapter must declare a string provider_id")
            normalized_key = key.strip().lower()
            normalized_adapter_id = adapter.provider_id.strip().lower()
            if normalized_key != normalized_adapter_id:
                raise ValueError("Adapter provider_id must match its registry key")
            if normalized_key in self._adapters:
                raise ValueError(f"Duplicate adapter provider: {normalized_key}")
            if not callable(getattr(adapter, "supports", None)) or not callable(
                getattr(adapter, "complete", None)
            ):
                raise TypeError("Adapter must implement supports and complete")
            self._adapters[normalized_key] = adapter

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
        if not isinstance(request, InferenceRequest):
            raise TypeError("request must be an InferenceRequest")
        if not isinstance(provider_id, str) or not provider_id.strip():
            raise ProviderDenied("PROVIDER_ID_REQUIRED")
        if (
            not isinstance(model_id, str)
            or not model_id.strip()
            or model_id != model_id.strip()
        ):
            raise ProviderDenied("EXACT_MODEL_ID_REQUIRED")

        normalized_provider_id = provider_id.strip().lower()
        decision = self._policy.authorize(
            provider_id=normalized_provider_id,
            model_id=model_id,
            quota_remaining=quota_remaining,
            estimated_cost_usd=estimated_cost_usd,
            paid_fallback_requested=paid_fallback_requested,
        )
        if not decision.allowed:
            raise ProviderDenied(decision.reason_code)

        adapter = self._adapters.get(normalized_provider_id)
        if adapter is None:
            raise ProviderDenied("PROVIDER_ADAPTER_NOT_REGISTERED")
        try:
            supported = adapter.supports(model_id)
        except Exception as exc:
            raise ProviderDenied("ADAPTER_MODEL_CHECK_FAILED") from exc
        if supported is not True:
            raise ProviderDenied("MODEL_NOT_SUPPORTED_BY_ADAPTER")

        try:
            output = adapter.complete(request, model_id)
        except Exception as exc:
            # Do not expose provider exception text, credentials or request data.
            raise ProviderDenied("PROVIDER_EXECUTION_FAILED") from exc
        if not isinstance(output, str) or not output.strip():
            raise ProviderDenied("PROVIDER_RETURNED_EMPTY_OUTPUT")
        if len(output) > self.MAX_OUTPUT_CHARS:
            raise ProviderDenied("PROVIDER_OUTPUT_TOO_LARGE")

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
