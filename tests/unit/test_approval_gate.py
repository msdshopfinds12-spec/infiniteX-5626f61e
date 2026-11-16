from dataclasses import replace
from datetime import datetime, timedelta, timezone
import hashlib
import hmac

import pytest

from iq_core.agents.approval_gate import (
    HumanApprovalEvidence,
    HumanApprovalGate,
    _canonical_payload,
)
from iq_core.agents.code_change_policy import CodeChangeProposal, ProposedFileChange
from iq_core.agents.proposal_fingerprint import CODE_CHANGE_POLICY_VERSION, proposal_fingerprint


KEY = b"test-only-approval-key-with-at-least-32-bytes"
NOW = datetime(2026, 11, 17, 12, 0, tzinfo=timezone.utc)


def make_proposal():
    return CodeChangeProposal(
        target_branch="fix/infiniteX-foundation-hardening",
        changes=(
            ProposedFileChange("iq_core/example.py", "VALUE = 1\n"),
            ProposedFileChange("tests/test_example.py", "def test_example(): pass\n"),
        ),
        rationale="Add a safe example",
        proposal_id="proposal-approval-001",
    )


def signed_evidence(proposal=None, **overrides):
    proposal = proposal or make_proposal()
    values = {
        "proposal_sha256": proposal_fingerprint(proposal),
        "target_branch": proposal.target_branch,
        "file_paths": tuple(change.path for change in proposal.changes),
        "reviewer_id": "reviewer-123",
        "approved_at": NOW,
        "expires_at": NOW + timedelta(minutes=5),
        "policy_version": CODE_CHANGE_POLICY_VERSION,
        "signature_hex": "",
    }
    values.update(overrides)
    unsigned = HumanApprovalEvidence(**values)
    signature = hmac.new(KEY, _canonical_payload(unsigned), hashlib.sha256).hexdigest()
    return replace(unsigned, signature_hex=signature)


def test_valid_signed_approval_verifies_exact_proposal_without_applying():
    proposal = make_proposal()
    result = HumanApprovalGate(verification_key=KEY).verify(
        proposal, signed_evidence(proposal), now=NOW + timedelta(minutes=1)
    )
    assert result.status == "APPROVAL_VERIFIED"
    assert "EXACT_PROPOSAL_APPROVED" in result.reason_codes
    assert "NO_PATCH_APPLIED" in result.reason_codes


def test_rejects_changed_proposal_content():
    proposal = make_proposal()
    evidence = signed_evidence(proposal)
    changed = replace(
        proposal,
        changes=(ProposedFileChange("iq_core/example.py", "VALUE = 2\n"),) + proposal.changes[1:],
    )
    result = HumanApprovalGate(verification_key=KEY).verify(changed, evidence, now=NOW)
    assert result.status == "BLOCKED"
    assert "PROPOSAL_DIGEST_MISMATCH" in result.reason_codes


def test_rejects_wrong_branch_and_file_set_even_with_valid_signature():
    proposal = make_proposal()
    evidence = signed_evidence(proposal)
    wrong_branch = replace(evidence, target_branch="fix/other")
    wrong_files = replace(evidence, file_paths=("iq_core/other.py",))
    gate = HumanApprovalGate(verification_key=KEY)
    assert "TARGET_BRANCH_MISMATCH" in gate.verify(proposal, wrong_branch, now=NOW).reason_codes
    assert "APPROVED_FILE_SET_MISMATCH" in gate.verify(proposal, wrong_files, now=NOW).reason_codes


def test_rejects_tampered_or_invalid_signature():
    proposal = make_proposal()
    evidence = signed_evidence(proposal)
    gate = HumanApprovalGate(verification_key=KEY)
    tampered = replace(evidence, reviewer_id="different-reviewer")
    assert "APPROVAL_SIGNATURE_INVALID" in gate.verify(proposal, tampered, now=NOW).reason_codes
    malformed = replace(evidence, signature_hex="not-a-signature")
    assert "INVALID_APPROVAL_SIGNATURE" in gate.verify(proposal, malformed, now=NOW).reason_codes


def test_rejects_expired_future_and_excessively_long_approval_windows():
    proposal = make_proposal()
    gate = HumanApprovalGate(verification_key=KEY)
    expired = signed_evidence(proposal, expires_at=NOW - timedelta(seconds=1))
    future = signed_evidence(proposal, approved_at=NOW + timedelta(seconds=1))
    long_lived = signed_evidence(proposal, expires_at=NOW + timedelta(minutes=16))
    assert "APPROVAL_EXPIRED" in gate.verify(proposal, expired, now=NOW).reason_codes
    assert "APPROVAL_FROM_FUTURE" in gate.verify(proposal, future, now=NOW).reason_codes
    assert "APPROVAL_TTL_EXCEEDED" in gate.verify(proposal, long_lived, now=NOW).reason_codes


def test_rejects_policy_version_mismatch_and_missing_reviewer():
    proposal = make_proposal()
    gate = HumanApprovalGate(verification_key=KEY)
    stale_policy = signed_evidence(proposal, policy_version="0.9")
    no_reviewer = signed_evidence(proposal, reviewer_id=" ")
    assert "POLICY_VERSION_MISMATCH" in gate.verify(proposal, stale_policy, now=NOW).reason_codes
    assert "REVIEWER_ID_REQUIRED" in gate.verify(proposal, no_reviewer, now=NOW).reason_codes


def test_rejects_naive_and_malformed_timestamps_and_file_lists():
    proposal = make_proposal()
    gate = HumanApprovalGate(verification_key=KEY)
    evidence = signed_evidence(proposal)
    naive = replace(evidence, approved_at=datetime(2026, 11, 17, 12, 0))
    malformed_time = replace(evidence, expires_at="not-a-datetime")
    malformed_files = replace(evidence, file_paths=("ok.py", 42))
    assert "NAIVE_APPROVAL_TIMESTAMP" in gate.verify(proposal, naive, now=NOW).reason_codes
    assert "INVALID_APPROVAL_TIMESTAMP" in gate.verify(proposal, malformed_time, now=NOW).reason_codes
    assert "INVALID_APPROVED_FILE_SET" in gate.verify(proposal, malformed_files, now=NOW).reason_codes


def test_rejects_naive_verification_time_and_non_evidence():
    proposal = make_proposal()
    gate = HumanApprovalGate(verification_key=KEY)
    evidence = signed_evidence(proposal)
    naive_now = datetime(2026, 11, 17, 12, 0)
    assert "NAIVE_VERIFICATION_TIME" in gate.verify(proposal, evidence, now=naive_now).reason_codes
    assert "INVALID_APPROVAL_EVIDENCE" in gate.verify(proposal, object(), now=NOW).reason_codes


def test_verification_key_must_be_long_enough():
    with pytest.raises(ValueError, match="at least 32 bytes"):
        HumanApprovalGate(verification_key=b"too-short")
