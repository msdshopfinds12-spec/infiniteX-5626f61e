"""Fail-closed policy gate for strictly $0 AI inference.

This module performs no network requests and contains no provider SDKs.
External providers are disabled unless an exact provider/model pair is explicitly
registered with fresh, account-specific free-tier evidence. A mock-only mode
remains available for deterministic tests and local development.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Mapping


ZERO_USD = Decimal("0.00")


@dataclass(frozen=True)
class FreeModelApproval:
    """Evidence-backed approval for one exact model on one provider account."""

    provider_id: str
    model_id: str
    verified_at: datetime
    expires_at: datetime
    account_eligible: bool
    data_policy_approved: bool


@dataclass(frozen=True)
class PolicyDecision:
    allowed: bool
    reason_code: str
    message: str


class ProviderPolicy:
    """Fail-closed $0 gate; an empty registry disables all external inference."""

    def __init__(
        self,
        approvals: Mapping[tuple[str, str], FreeModelApproval] | None = None,
    ) -> None:
        self._approvals = dict(approvals or {})

    def authorize(
        self,
        *,
        provider_id: str,
        model_id: str,
        now: datetime | None = None,
        quota_remaining: int | None = None,
        estimated_cost_usd: Decimal | str | int | float = ZERO_USD,
        paid_fallback_requested: bool = False,
    ) -> PolicyDecision:
        current = now or datetime.now(timezone.utc)
        if current.tzinfo is None:
            return self._deny("INVALID_CLOCK", "Policy evaluation requires timezone-aware time.")

        if not isinstance(provider_id, str) or not isinstance(model_id, str):
            return self._deny("MODEL_ID_REQUIRED", "Provider and exact model ID must be strings.")

        provider = provider_id.strip().lower()
        model = model_id.strip()

        if provider == "mock" and model == "mock":
            if paid_fallback_requested:
                return self._deny("PAID_FALLBACK_FORBIDDEN", "Paid fallback is never permitted.")
            try:
                cost = Decimal(str(estimated_cost_usd))
            except (InvalidOperation, ValueError):
                return self._deny("INVALID_COST", "Estimated cost must be a valid decimal.")
            if cost != ZERO_USD:
                return self._deny("NONZERO_COST", "Mock mode must have exactly zero cost.")
            return PolicyDecision(True, "MOCK_ALLOWED", "Deterministic mock execution is allowed.")

        if not provider or not model:
            return self._deny("MODEL_ID_REQUIRED", "Provider and exact model ID are required.")

        if paid_fallback_requested:
            return self._deny("PAID_FALLBACK_FORBIDDEN", "Paid fallback is never permitted.")

        approval = self._approvals.get((provider, model))
        if approval is None:
            return self._deny("MODEL_NOT_ALLOWLISTED", "This exact provider/model pair is not approved.")

        if approval.provider_id != provider or approval.model_id != model:
            return self._deny("APPROVAL_MISMATCH", "Approval metadata does not match the requested model.")

        if approval.verified_at.tzinfo is None or approval.expires_at.tzinfo is None:
            return self._deny("INVALID_APPROVAL_DATES", "Approval timestamps must include a timezone.")

        if approval.expires_at <= approval.verified_at:
            return self._deny("INVALID_APPROVAL_DATES", "Approval expiry must follow its verification time.")

        if approval.verified_at > current or approval.expires_at <= current:
            return self._deny("FREE_TIER_EVIDENCE_EXPIRED", "Free-tier evidence is stale or not yet valid.")

        if not approval.account_eligible:
            return self._deny("ACCOUNT_NOT_ELIGIBLE", "This account's free-tier eligibility is unverified.")

        if not approval.data_policy_approved:
            return self._deny("DATA_POLICY_NOT_APPROVED", "Provider data-use terms have not been approved.")

        try:
            cost = Decimal(str(estimated_cost_usd))
        except (InvalidOperation, ValueError):
            return self._deny("INVALID_COST", "Estimated cost must be a valid decimal.")

        if cost != ZERO_USD:
            return self._deny("NONZERO_COST", "Strict $0 mode rejects every non-zero estimated cost.")

        if (
            isinstance(quota_remaining, bool)
            or not isinstance(quota_remaining, int)
            or quota_remaining <= 0
        ):
            return self._deny("FREE_QUOTA_UNAVAILABLE", "Free quota is unknown or exhausted.")

        return PolicyDecision(True, "FREE_MODEL_ALLOWED", "Exact model is approved within verified free quota.")

    @staticmethod
    def _deny(code: str, message: str) -> PolicyDecision:
        return PolicyDecision(False, code, message)


DEFAULT_PROVIDER_POLICY = ProviderPolicy()
