"""Verification-only human approval gate for exact code proposals.

The HMAC key must be held by a trusted server-side approval service that only
signs after authenticating an authorized human reviewer. This module verifies
evidence; it does not authenticate users, issue approvals, or apply patches.
"""
from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from iq_core.agents.code_change_policy import CodeChangeProposal
from iq_core.agents.proposal_fingerprint import (
    CODE_CHANGE_POLICY_VERSION,
    proposal_fingerprint,
)


@dataclass(frozen=True)
class HumanApprovalEvidence:
    proposal_sha256: str
    target_branch: str
    file_paths: tuple[str, ...]
    reviewer_id: str
    approved_at: datetime
    expires_at: datetime
    policy_version: str
    signature_hex: str


@dataclass(frozen=True)
class ApprovalVerification:
    status: str
    reason_codes: tuple[str, ...]


def _canonical_payload(evidence: HumanApprovalEvidence) -> bytes:
    payload = {
        "proposal_sha256": evidence.proposal_sha256,
        "target_branch": evidence.target_branch,
        "file_paths": sorted(evidence.file_paths),
        "reviewer_id": evidence.reviewer_id,
        "approved_at": evidence.approved_at.astimezone(timezone.utc).isoformat(),
        "expires_at": evidence.expires_at.astimezone(timezone.utc).isoformat(),
        "policy_version": evidence.policy_version,
    }
    return json.dumps(
        payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")


class HumanApprovalGate:
    """Verify signed human approval evidence without applying any code changes."""

    MAX_APPROVAL_TTL = timedelta(minutes=15)

    def __init__(self, *, verification_key: bytes) -> None:
        if not isinstance(verification_key, bytes) or len(verification_key) < 32:
            raise ValueError("verification_key must contain at least 32 bytes")
        self._verification_key = verification_key

    def verify(
        self,
        proposal: CodeChangeProposal,
        evidence: HumanApprovalEvidence,
        *,
        now: datetime | None = None,
    ) -> ApprovalVerification:
        if not isinstance(evidence, HumanApprovalEvidence):
            return ApprovalVerification("BLOCKED", ("INVALID_APPROVAL_EVIDENCE",))
        try:
            digest = proposal_fingerprint(proposal)
        except (TypeError, ValueError):
            return ApprovalVerification("BLOCKED", ("INVALID_PROPOSAL",))

        current = now or datetime.now(timezone.utc)
        if not isinstance(current, datetime):
            return ApprovalVerification("BLOCKED", ("INVALID_VERIFICATION_TIME",))
        if current.tzinfo is None or current.utcoffset() is None:
            return ApprovalVerification("BLOCKED", ("NAIVE_VERIFICATION_TIME",))
        if (
            not isinstance(evidence.approved_at, datetime)
            or not isinstance(evidence.expires_at, datetime)
        ):
            return ApprovalVerification("BLOCKED", ("INVALID_APPROVAL_TIMESTAMP",))
        if (
            evidence.approved_at.tzinfo is None
            or evidence.approved_at.utcoffset() is None
            or evidence.expires_at.tzinfo is None
            or evidence.expires_at.utcoffset() is None
        ):
            return ApprovalVerification("BLOCKED", ("NAIVE_APPROVAL_TIMESTAMP",))
        if not isinstance(evidence.reviewer_id, str) or not evidence.reviewer_id.strip():
            return ApprovalVerification("BLOCKED", ("REVIEWER_ID_REQUIRED",))
        if evidence.proposal_sha256 != digest:
            return ApprovalVerification("BLOCKED", ("PROPOSAL_DIGEST_MISMATCH",))
        if evidence.target_branch != proposal.target_branch:
            return ApprovalVerification("BLOCKED", ("TARGET_BRANCH_MISMATCH",))
        if evidence.policy_version != CODE_CHANGE_POLICY_VERSION:
            return ApprovalVerification("BLOCKED", ("POLICY_VERSION_MISMATCH",))

        if (
            not isinstance(evidence.file_paths, tuple)
            or any(not isinstance(path, str) or not path.strip() for path in evidence.file_paths)
        ):
            return ApprovalVerification("BLOCKED", ("INVALID_APPROVED_FILE_SET",))
        expected_paths = tuple(sorted(change.path for change in proposal.changes))
        if tuple(sorted(evidence.file_paths)) != expected_paths:
            return ApprovalVerification("BLOCKED", ("APPROVED_FILE_SET_MISMATCH",))
        if evidence.approved_at > current:
            return ApprovalVerification("BLOCKED", ("APPROVAL_FROM_FUTURE",))
        if evidence.expires_at <= current:
            return ApprovalVerification("BLOCKED", ("APPROVAL_EXPIRED",))
        if evidence.expires_at <= evidence.approved_at:
            return ApprovalVerification("BLOCKED", ("INVALID_APPROVAL_WINDOW",))
        if evidence.expires_at - evidence.approved_at > self.MAX_APPROVAL_TTL:
            return ApprovalVerification("BLOCKED", ("APPROVAL_TTL_EXCEEDED",))
        if (
            not isinstance(evidence.signature_hex, str)
            or len(evidence.signature_hex) != 64
        ):
            return ApprovalVerification("BLOCKED", ("INVALID_APPROVAL_SIGNATURE",))

        expected_signature = hmac.new(
            self._verification_key,
            _canonical_payload(evidence),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected_signature, evidence.signature_hex):
            return ApprovalVerification("BLOCKED", ("APPROVAL_SIGNATURE_INVALID",))

        return ApprovalVerification(
            "APPROVAL_VERIFIED",
            ("EXACT_PROPOSAL_APPROVED", "NO_PATCH_APPLIED"),
        )
