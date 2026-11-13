"""Security specialist contract; provider integration is intentionally pending."""

from iq_core.agents.provider_agents import ProviderUnconfiguredAgent


class SecurityAgent(ProviderUnconfiguredAgent):
    def __init__(self) -> None:
        super().__init__(
            name="security",
            description="Security analysis and threat-review specialist.",
            task_type="agent.security",
            capabilities=("threat-modeling", "security-review", "risk-analysis"),
        )
