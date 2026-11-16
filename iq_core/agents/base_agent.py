"""Stable agent contract with explicit provider-availability boundaries."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
import json
from typing import Any
from uuid import uuid4


@dataclass(frozen=True)
class AgentRequest:
    objective: str
    payload: dict[str, Any] = field(default_factory=dict)
    correlation_id: str = field(default_factory=lambda: str(uuid4()))

    MAX_OBJECTIVE_CHARS = 4_000
    MAX_PAYLOAD_BYTES = 65_536

    def __post_init__(self) -> None:
        if not isinstance(self.objective, str) or not self.objective.strip():
            raise ValueError("Agent objective must be a non-empty string")
        normalized_objective = self.objective.strip()
        if len(normalized_objective) > self.MAX_OBJECTIVE_CHARS:
            raise ValueError("Agent objective exceeds the 4000-character limit")
        if not isinstance(self.payload, dict):
            raise TypeError("Agent payload must be a JSON-compatible object")
        if not isinstance(self.correlation_id, str) or not self.correlation_id.strip():
            raise ValueError("Agent correlation_id must be a non-empty string")
        try:
            encoded = json.dumps(
                self.payload,
                ensure_ascii=False,
                allow_nan=False,
                separators=(",", ":"),
            )
        except (TypeError, ValueError, RecursionError) as exc:
            raise ValueError("Agent payload must contain only JSON-compatible values") from exc
        if len(encoded.encode("utf-8")) > self.MAX_PAYLOAD_BYTES:
            raise ValueError("Agent payload exceeds the 65536-byte limit")
        object.__setattr__(self, "objective", normalized_objective)
        object.__setattr__(self, "payload", json.loads(encoded))
        object.__setattr__(self, "correlation_id", self.correlation_id.strip())


@dataclass(frozen=True)
class AgentResponse:
    agent_name: str
    execution_status: str
    provider_status: str
    summary: str
    output: dict[str, Any] = field(default_factory=dict)
    issues: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        result = asdict(self)
        result["issues"] = list(self.issues)
        return result


class BaseAgent(ABC):
    """Contract for an agent; implementations must not imply an LLM is configured."""

    name: str
    description: str
    task_type: str
    capabilities: tuple[str, ...]

    def __init__(
        self,
        *,
        name: str,
        description: str,
        task_type: str,
        capabilities: tuple[str, ...],
    ) -> None:
        self.name = name.strip()
        self.description = description.strip()
        self.task_type = task_type.strip()
        self.capabilities = tuple(item.strip() for item in capabilities)

    @abstractmethod
    def run(self, request: AgentRequest) -> AgentResponse:
        """Execute one bounded request and return a truthful status."""
