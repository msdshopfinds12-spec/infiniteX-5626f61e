"""Master-agent delegation through the existing IQ task lifecycle."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from iq_core.agents.agent_registry import AgentRegistry
from iq_core.agents.base_agent import AgentRequest, BaseAgent
from iq_core.kernel.iq_engine import IQEngine, IQExecutionResult, IQTask


@dataclass(frozen=True)
class AgentDelegationResult:
    agent_name: str
    correlation_id: str
    execution: IQExecutionResult

    @property
    def agent_output(self) -> dict[str, Any]:
        if isinstance(self.execution.output, dict):
            return self.execution.output
        return {}


class MasterAgent:
    """Synchronous in-process dispatcher; not a distributed swarm scheduler."""

    def __init__(self, engine: IQEngine, registry: AgentRegistry | None = None) -> None:
        self.engine = engine
        self.registry = registry or AgentRegistry()

    def register_agent(self, agent: BaseAgent) -> None:
        AgentRegistry.validate(agent)
        if self.registry.get(agent.name) is not None:
            raise ValueError(f"Agent already registered: {agent.name}")
        if any(item.task_type == agent.task_type for item in self.registry.list_agents()):
            raise ValueError(f"Agent task type already registered: {agent.task_type}")

        def handler(data: dict[str, Any]) -> dict[str, Any]:
            request = AgentRequest(
                objective=data["objective"],
                payload=data["payload"],
                correlation_id=data["correlation_id"],
            )
            return agent.run(request).to_dict()

        self.engine.register_handler(agent.task_type, handler)
        self.registry.register(agent)

    def delegate(
        self,
        agent_name: str,
        objective: str,
        payload: dict[str, Any] | None = None,
        *,
        correlation_id: str | None = None,
    ) -> AgentDelegationResult:
        agent = self.registry.get(agent_name)
        if agent is None:
            raise ValueError(f"Unknown agent: {agent_name}")
        if not objective.strip():
            raise ValueError("Objective cannot be empty")

        request_id = correlation_id or str(uuid4())
        task = IQTask(
            name=agent.task_type,
            objective=objective,
            input_data={
                "objective": objective,
                "payload": dict(payload or {}),
                "correlation_id": request_id,
            },
        )
        task_id = self.engine.submit(task)
        execution = self.engine.execute(task_id)
        return AgentDelegationResult(
            agent_name=agent.name,
            correlation_id=request_id,
            execution=execution,
        )
