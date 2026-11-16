"""Provider-neutral request and result contracts.

The contracts intentionally contain no vendor SDK types and no credentials.
"""
from __future__ import annotations

from dataclasses import dataclass
from uuid import uuid4


@dataclass(frozen=True)
class InferenceRequest:
    """Bounded inference input. Do not log prompt or payload values by default."""

    purpose: str
    prompt: str
    request_id: str = ""
    tenant_id: str | None = None
    max_output_tokens: int = 256

    def __post_init__(self) -> None:
        if not self.purpose.strip():
            raise ValueError("purpose is required")
        if not self.prompt.strip():
            raise ValueError("prompt is required")
        if len(self.prompt) > 32_000:
            raise ValueError("prompt exceeds the 32000-character safety limit")
        if not 1 <= self.max_output_tokens <= 4096:
            raise ValueError("max_output_tokens must be between 1 and 4096")
        if not self.request_id:
            object.__setattr__(self, "request_id", str(uuid4()))


@dataclass(frozen=True)
class InferenceResult:
    """Auditable result metadata; zero cost is asserted only after policy approval."""

    request_id: str
    provider_id: str
    model_id: str
    output: str
    policy_reason_code: str
    estimated_cost_usd: str = "0.00"
    execution_mode: str = "MOCK"
