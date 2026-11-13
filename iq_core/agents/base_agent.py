"""Stable agent contract with explicit provider-availability boundaries."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from typing import Any
from uuid import uuid4


@dataclass(frozen=True)
class AgentRequest:
    objective: str
    payload: dict[str, Any] = field(default_factory=dict)
    correlation_id: str = field(default_factory=lambda: str(uuid4()))


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
