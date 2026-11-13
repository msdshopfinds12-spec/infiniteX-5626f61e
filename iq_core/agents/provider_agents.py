"""Provider-unconfigured agent base used by the four specialist stubs."""

from iq_core.agents.base_agent import AgentRequest, AgentResponse, BaseAgent


class ProviderUnconfiguredAgent(BaseAgent):
    """Safe stub: reports review-needed instead of fabricating autonomous work."""

    def run(self, request: AgentRequest) -> AgentResponse:
        return AgentResponse(
            agent_name=self.name,
            execution_status="NEEDS_REVIEW",
            provider_status="NOT_CONFIGURED",
            summary=(
                f"{self.name} received the task, but no AI provider is configured. "
                "No research, code changes, security scan, or QA execution was performed."
            ),
            output={
                "objective_received": request.objective,
                "payload_received": request.payload,
                "correlation_id": request.correlation_id,
            },
            issues=("AI_PROVIDER_NOT_CONFIGURED", "HUMAN_REVIEW_REQUIRED"),
        )
