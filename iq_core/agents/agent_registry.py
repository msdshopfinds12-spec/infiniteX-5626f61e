"""In-process agent registry with strict metadata and duplicate checks."""

from __future__ import annotations

from threading import RLock

from iq_core.agents.base_agent import BaseAgent


class AgentRegistry:
    """Process-local registry; persistence and distributed discovery are deferred."""

    def __init__(self) -> None:
        self._agents: dict[str, BaseAgent] = {}
        self._task_types: set[str] = set()
        self._lock = RLock()

    @staticmethod
    def validate(agent: BaseAgent) -> None:
        for field_name in ("name", "description", "task_type"):
            value = getattr(agent, field_name, None)
            if not isinstance(value, str) or not value.strip():
                raise ValueError(f"Agent {field_name} cannot be empty")
        capabilities = getattr(agent, "capabilities", None)
        if not isinstance(capabilities, tuple) or not capabilities:
            raise ValueError("Agent must declare at least one capability")
        if any(not isinstance(item, str) or not item.strip() for item in capabilities):
            raise ValueError("Agent capabilities must be non-empty strings")
        if len(set(capabilities)) != len(capabilities):
            raise ValueError("Agent capabilities must be unique")

    def register(self, agent: BaseAgent) -> None:
        self.validate(agent)
        with self._lock:
            if agent.name in self._agents:
                raise ValueError(f"Agent already registered: {agent.name}")
            if agent.task_type in self._task_types:
                raise ValueError(f"Agent task type already registered: {agent.task_type}")
            self._agents[agent.name] = agent
            self._task_types.add(agent.task_type)

    def get(self, name: str) -> BaseAgent | None:
        with self._lock:
            return self._agents.get(name)

    def list_agents(self) -> tuple[BaseAgent, ...]:
        with self._lock:
            return tuple(self._agents.values())
