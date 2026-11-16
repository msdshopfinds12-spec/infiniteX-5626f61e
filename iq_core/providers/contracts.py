"""Provider-neutral request and result contracts.

Contracts contain no vendor SDK types or credentials. Validation happens at
construction time so malformed data is rejected before policy evaluation or
adapter invocation.
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
        if not isinstance(self.purpose, str) or not self.purpose.strip():
            raise ValueError("purpose must be a non-empty string")
        if not isinstance(self.prompt, str) or not self.prompt.strip():
            raise ValueError("prompt must be a non-empty string")
        if len(self.prompt) > 32_000:
            raise ValueError("prompt exceeds the 32000-character safety limit")
        if (
            isinstance(self.max_output_tokens, bool)
            or not isinstance(self.max_output_tokens, int)
            or not 1 <= self.max_output_tokens <= 4096
        ):
            raise ValueError("max_output_tokens must be an integer between 1 and 4096")
        if self.tenant_id is not None and (
            not isinstance(self.tenant_id, str) or not self.tenant_id.strip()
        ):
            raise ValueError("tenant_id must be omitted or a non-empty string")
        if not isinstance(self.request_id, str):
            raise ValueError("request_id must be a string")
        if not self.request_id.strip():
            object.__setattr__(self, "request_id", str(uuid4()))
        else:
            object.__setattr__(self, "request_id", self.request_id.strip())


@dataclass(frozen=True)
class InferenceResult:
    """Auditable result metadata; cost is policy-approved, not a billing receipt."""

    request_id: str
    provider_id: str
    model_id: str
    output: str
    policy_reason_code: str
    estimated_cost_usd: str = "0.00"
    execution_mode: str = "MOCK"
