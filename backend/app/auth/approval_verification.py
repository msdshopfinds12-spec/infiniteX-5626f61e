"""Authenticated-reviewer adapter for strict Ed25519 approval verification.

This adapter prevents API callers from supplying reviewer subject or role as
verification expectations. It accepts only the server-derived reviewer context.
It does not issue approvals, load private keys, consume nonces, or apply patches.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from backend.app.auth.approval_reviewer import ApprovalReviewerContext
from iq_core.agents.approval_contract import (
    ApprovalClaims,
    verify_ed25519_approval,
)


@dataclass(frozen=True)
class ApprovalVerificationScope:
    """Proposal and policy values loaded from trusted server-side state."""

    issuer: str
    audience: str
    repository_id: str
    target_branch: str
    base_commit_sha: str
    proposal_id: str
    proposal_sha256: str
    policy_version: str
    file_paths: tuple[str, ...]
    now: int


def verify_for_authenticated_reviewer(
    *,
    reviewer: ApprovalReviewerContext,
    payload: Mapping[str, Any],
    signature: bytes,
    public_key: Ed25519PublicKey,
    scope: ApprovalVerificationScope,
) -> ApprovalClaims:
    """Verify evidence against server-derived identity and trusted proposal scope.

    Call only after FastAPI has resolved get_approval_reviewer and the proposal
    has been loaded from trusted server-side storage. Never build reviewer or
    scope values from request-body fields.
    """
    if not isinstance(reviewer, ApprovalReviewerContext):
        raise TypeError("verification requires server-derived reviewer context")
    if not isinstance(scope, ApprovalVerificationScope):
        raise TypeError("verification requires trusted server-side proposal scope")
    return verify_ed25519_approval(
        payload,
        signature,
        public_key,
        expected_issuer=scope.issuer,
        expected_audience=scope.audience,
        expected_reviewer_subject=reviewer.subject,
        expected_reviewer_role=reviewer.role,
        expected_repository_id=scope.repository_id,
        expected_branch=scope.target_branch,
        expected_base_commit_sha=scope.base_commit_sha,
        expected_proposal_id=scope.proposal_id,
        expected_proposal_sha256=scope.proposal_sha256,
        expected_policy_version=scope.policy_version,
        expected_file_paths=scope.file_paths,
        now=scope.now,
    )
