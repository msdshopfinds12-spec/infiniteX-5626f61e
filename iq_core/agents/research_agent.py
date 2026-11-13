"""Research specialist contract; provider integration is intentionally pending."""

from iq_core.agents.provider_agents import ProviderUnconfiguredAgent


class ResearchAgent(ProviderUnconfiguredAgent):
    def __init__(self) -> None:
        super().__init__(
            name="research",
            description="Research and evidence-gathering specialist.",
            task_type="agent.research",
            capabilities=("research", "source-analysis", "summarization"),
        )
