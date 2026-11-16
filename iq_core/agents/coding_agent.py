"""Coding specialist with deterministic, human-gated proposal validation.

This agent does not generate code with an LLM, execute code, write files, or
commit changes. It can validate a supplied patch proposal using local policy.
"""
from __future__ import annotations

from typing import Any

from iq_core.agents.base_agent import AgentRequest, AgentResponse
from iq_core.agents.code_change_policy import (
    CodeChangePolicy,
    CodeChangeProposal,
    ProposedFileChange,
)
from iq_core.agents.provider_agents import ProviderUnconfiguredAgent


class CodingAgent(ProviderUnconfiguredAgent):
    def __init__(self, policy: CodeChangePolicy | None = None) -> None:
        super().__init__(
            name="coding",
            description="Code proposal validation; model-based generation is not configured.",
            task_type="agent.coding",
            capabilities=(
                "code-proposal-validation",
                "change-risk-screening",
                "human-approval-gating",
            ),
        )
        self._code_change_policy = policy or CodeChangePolicy()

    def run(self, request: AgentRequest) -> AgentResponse:
        proposal_data: Any = request.payload.get("proposal")
        if proposal_data is None:
            return super().run(request)
        if not isinstance(proposal_data, dict):
            return AgentResponse(
                agent_name=self.name,
                execution_status="BLOCKED",
                provider_status="LOCAL_POLICY_ONLY",
                summary="The supplied code proposal payload must be an object.",
                issues=("INVALID_PROPOSAL_PAYLOAD",),
            )

        raw_changes = proposal_data.get("changes")
        changes: tuple[ProposedFileChange, ...]
        if isinstance(raw_changes, (list, tuple)):
            changes = tuple(
                ProposedFileChange(
                    path=item.get("path") if isinstance(item, dict) else None,
                    content=item.get("content") if isinstance(item, dict) else None,
                )
                for item in raw_changes
            )
        else:
            changes = ()

        proposal = CodeChangeProposal(
            target_branch=proposal_data.get("target_branch"),
            changes=changes,
            rationale=proposal_data.get("rationale"),
            proposal_id=proposal_data.get("proposal_id"),
        )
        decision = self._code_change_policy.evaluate(proposal)
        return AgentResponse(
            agent_name=self.name,
            execution_status=decision.status,
            provider_status="LOCAL_POLICY_ONLY",
            summary=(
                "Proposal passed deterministic screening and requires human approval. "
                "No files were written and no code was executed."
                if decision.status == "REVIEW_REQUIRED"
                else "Proposal was blocked by deterministic code-change policy."
            ),
            output={
                "proposal_id": proposal.proposal_id,
                "target_branch": proposal.target_branch,
                "file_count": decision.file_count,
                "total_bytes": decision.total_bytes,
                "reason_codes": list(decision.reason_codes),
                "automatic_write_performed": False,
                "code_execution_performed": False,
            },
            issues=decision.reason_codes,
        )
