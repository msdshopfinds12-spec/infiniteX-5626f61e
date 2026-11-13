"""Coding specialist contract; provider integration is intentionally pending."""

from iq_core.agents.provider_agents import ProviderUnconfiguredAgent


class CodingAgent(ProviderUnconfiguredAgent):
    def __init__(self) -> None:
        super().__init__(
            name="coding",
            description="Code implementation and review specialist.",
            task_type="agent.coding",
            capabilities=("code-generation", "code-review", "refactoring"),
        )
