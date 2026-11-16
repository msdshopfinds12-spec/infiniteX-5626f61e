"""Atomic approval-to-apply-intent domain boundary.

This module deliberately defines a persistence port, not a database adapter.
A production implementation must insert the unique nonce and immutable intent
inside one database transaction. No patch execution occurs here.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from iq_core.agents.approval_contract import ApprovalClaims


@dataclass(frozen=True)
class ApprovalApplyIntent:
    """Immutable, fully scoped authorization record for a future patch worker."""

    nonce_id: str
    reviewer_subject: str
    reviewer_role: str
    repository_id: str
    target_branch: str
    base_commit_sha: str
    proposal_id: str
    proposal_sha256: str
    policy_version: str
    file_paths: tuple[str, ...]
    issued_at: int
    expires_at: int
    schema_version: int = 1

    @classmethod
    def from_verified_claims(cls, claims: ApprovalClaims) -> "ApprovalApplyIntent":
        if not isinstance(claims, ApprovalClaims):
            raise TypeError("only cryptographically verified ApprovalClaims are accepted")
        return cls(
            nonce_id=claims.jti,
            reviewer_subject=claims.sub,
            reviewer_role=claims.reviewer_role,
            repository_id=claims.repository_id,
            target_branch=claims.target_branch,
            base_commit_sha=claims.base_commit_sha,
            proposal_id=claims.proposal_id,
            proposal_sha256=claims.proposal_sha256,
            policy_version=claims.policy_version,
            file_paths=claims.file_paths,
            issued_at=claims.iat,
            expires_at=claims.exp,
            schema_version=claims.schema_version,
        )


class ApprovalApplyIntentStore(Protocol):
    """Persistence port; implementations must guarantee a single atomic commit."""

    def record_once(self, *, intent: ApprovalApplyIntent) -> bool:
        """Persist unique nonce + immutable intent atomically.

        Return True only when both records commit. Return False if nonce_id was
        already consumed. On any storage failure, raise and roll back both writes.
        A database unique constraint on nonce_id is mandatory; process-local locks
        or in-memory sets are not production-safe.
        """
        ...


def persist_verified_apply_intent(
    *,
    claims: ApprovalClaims,
    store: ApprovalApplyIntentStore,
) -> ApprovalApplyIntent:
    """Record a verified approval once; this function never executes code."""
    if not isinstance(claims, ApprovalClaims):
        raise TypeError("verified ApprovalClaims are required")
    intent = ApprovalApplyIntent.from_verified_claims(claims)
    if not store.record_once(intent=intent):
        raise ValueError("APPROVAL_REPLAY_DETECTED")
    return intent
