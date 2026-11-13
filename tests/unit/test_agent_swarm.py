from __future__ import annotations

import pytest

from iq_core.agents.agent_registry import AgentRegistry
from iq_core.agents.base_agent import AgentRequest, AgentResponse, BaseAgent
from iq_core.agents.coding_agent import CodingAgent
from iq_core.agents.master_agent import MasterAgent
from iq_core.agents.qa_agent import QAAgent
from iq_core.agents.research_agent import ResearchAgent
from iq_core.agents.security_agent import SecurityAgent
from iq_core.kernel.iq_engine import IQEngine, IQStatus


def test_registry_registers_and_lists_specialist_agents() -> None:
    registry = AgentRegistry()
    agents = (ResearchAgent(), CodingAgent(), SecurityAgent(), QAAgent())
    for agent in agents:
        registry.register(agent)
    assert {agent.name for agent in registry.list_agents()} == {
        "research", "coding", "security", "qa"
    }


def test_registry_rejects_duplicate_agent_name() -> None:
    registry = AgentRegistry()
    registry.register(ResearchAgent())
    with pytest.raises(ValueError, match="already registered"):
        registry.register(ResearchAgent())


def test_registry_rejects_duplicate_task_type() -> None:
    registry = AgentRegistry()
    registry.register(ResearchAgent())
    duplicate_type = CodingAgent()
    duplicate_type.task_type = "agent.research"
    with pytest.raises(ValueError, match="task type already registered"):
        registry.register(duplicate_type)


def test_registry_rejects_missing_capabilities() -> None:
    registry = AgentRegistry()
    invalid = ResearchAgent()
    invalid.capabilities = ()
    with pytest.raises(ValueError, match="at least one capability"):
        registry.register(invalid)


def test_master_agent_delegates_and_preserves_correlation_id() -> None:
    engine = IQEngine()
    master = MasterAgent(engine)
    master.register_agent(ResearchAgent())
    result = master.delegate(
        "research", "Investigate the architecture",
        {"scope": "read-only"}, correlation_id="corr-phase-7",
    )
    assert result.execution.status is IQStatus.COMPLETED
    assert result.correlation_id == "corr-phase-7"
    assert result.agent_output["agent_name"] == "research"
    assert result.agent_output["provider_status"] == "NOT_CONFIGURED"
    assert result.agent_output["execution_status"] == "NEEDS_REVIEW"
    assert result.agent_output["output"]["correlation_id"] == "corr-phase-7"


def test_master_agent_rejects_unknown_agent() -> None:
    master = MasterAgent(IQEngine())
    with pytest.raises(ValueError, match="Unknown agent"):
        master.delegate("missing", "Do work")


def test_master_agent_rejects_blank_objective() -> None:
    master = MasterAgent(IQEngine())
    master.register_agent(ResearchAgent())
    with pytest.raises(ValueError, match="Objective"):
        master.delegate("research", "  ")


def test_all_specialists_fail_closed_without_provider() -> None:
    agents = (ResearchAgent(), CodingAgent(), SecurityAgent(), QAAgent())
    for agent in agents:
        response = agent.run(AgentRequest(objective="test"))
        assert isinstance(response, AgentResponse)
        assert response.provider_status == "NOT_CONFIGURED"
        assert response.execution_status == "NEEDS_REVIEW"
        assert "HUMAN_REVIEW_REQUIRED" in response.issues


def test_master_agent_rejects_duplicate_engine_handler() -> None:
    engine = IQEngine()
    engine.register_handler("agent.research", lambda _: {"unexpected": True})
    master = MasterAgent(engine)
    with pytest.raises(ValueError, match="Handler already registered"):
        master.register_agent(ResearchAgent())
    assert master.registry.get("research") is None
