"""Fail-closed plan entitlements. This module does not process payments."""
from __future__ import annotations
from dataclasses import dataclass
from enum import StrEnum

class Plan(StrEnum):
    STANDARD = "standard"
    PLUS = "plus"
    PRO = "pro"
    ENTERPRISE = "enterprise"

class Capability(StrEnum):
    CHAT_BASIC = "chat.basic"
    PROJECTS_BASIC = "projects.basic"
    AGENTS_BASIC = "agents.basic"
    MEMORY_BASIC = "memory.basic"
    SECURITY_BASELINE = "security.baseline"
    PRIVACY_BASELINE = "privacy.baseline"
    APPROVAL_REQUIRED = "approval.required"
    CHAT_ADVANCED = "chat.advanced"
    AGENTS_MULTI = "agents.multi"
    WORKFLOWS_EXTENDED = "workflows.extended"
    MEMORY_EXTENDED = "memory.extended"
    MODEL_ROUTING = "models.routing"
    EVALUATIONS_ADVANCED = "evaluations.advanced"
    CODE_REVIEW_ADVANCED = "code_review.advanced"
    TEAM_WORKSPACES = "teams.workspaces"
    AUDIT_EXPORT = "audit.export"
    POLICY_ADMIN = "policy.admin"

BASELINE_CAPABILITIES = frozenset({Capability.CHAT_BASIC, Capability.PROJECTS_BASIC, Capability.AGENTS_BASIC, Capability.MEMORY_BASIC, Capability.SECURITY_BASELINE, Capability.PRIVACY_BASELINE, Capability.APPROVAL_REQUIRED})
_PLAN_CAPABILITIES: dict[Plan, frozenset[Capability]] = {
    Plan.STANDARD: BASELINE_CAPABILITIES,
    Plan.PLUS: BASELINE_CAPABILITIES | frozenset({Capability.CHAT_ADVANCED, Capability.AGENTS_MULTI, Capability.WORKFLOWS_EXTENDED, Capability.MEMORY_EXTENDED}),
    Plan.PRO: BASELINE_CAPABILITIES | frozenset({Capability.CHAT_ADVANCED, Capability.AGENTS_MULTI, Capability.WORKFLOWS_EXTENDED, Capability.MEMORY_EXTENDED, Capability.MODEL_ROUTING, Capability.EVALUATIONS_ADVANCED, Capability.CODE_REVIEW_ADVANCED}),
    Plan.ENTERPRISE: BASELINE_CAPABILITIES | frozenset({Capability.CHAT_ADVANCED, Capability.AGENTS_MULTI, Capability.WORKFLOWS_EXTENDED, Capability.MEMORY_EXTENDED, Capability.MODEL_ROUTING, Capability.EVALUATIONS_ADVANCED, Capability.CODE_REVIEW_ADVANCED, Capability.TEAM_WORKSPACES, Capability.AUDIT_EXPORT, Capability.POLICY_ADMIN}),
}

@dataclass(frozen=True, slots=True)
class EntitlementSnapshot:
    """Resolved server-side access; never construct from untrusted client input."""
    plan: Plan
    capabilities: frozenset[Capability]
    def allows(self, capability: Capability) -> bool:
        return capability in self.capabilities

class FeatureNotAvailable(PermissionError):
    """Raised when the active plan does not include a requested capability."""

def resolve_entitlements(trusted_plan: Plan | str | None) -> EntitlementSnapshot:
    """Resolve a plan already established by trusted server-side identity/billing logic.

    Missing plan data defaults to Standard. Unknown values fail closed to Standard.
    Never pass a plan supplied directly by a browser, mobile client, URL or request body.
    """
    if trusted_plan is None:
        plan = Plan.STANDARD
    else:
        try:
            plan = Plan(trusted_plan)
        except (TypeError, ValueError):
            plan = Plan.STANDARD
    return EntitlementSnapshot(plan=plan, capabilities=_PLAN_CAPABILITIES[plan])

def require_capability(entitlements: EntitlementSnapshot, capability: Capability) -> None:
    """Enforce one capability at the backend service boundary."""
    if not entitlements.allows(capability):
        raise FeatureNotAvailable(f"capability is not included: {capability.value}")
