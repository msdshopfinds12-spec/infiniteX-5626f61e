"""Quality-assurance specialist contract; provider integration is intentionally pending."""

from iq_core.agents.provider_agents import ProviderUnconfiguredAgent


class QAAgent(ProviderUnconfiguredAgent):
    def __init__(self) -> None:
        super().__init__(
            name="qa",
            description="Test planning and quality-assurance specialist.",
            task_type="agent.qa",
            capabilities=("test-planning", "test-review", "quality-analysis"),
        )
