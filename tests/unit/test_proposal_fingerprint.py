import pytest

from iq_core.agents.code_change_policy import CodeChangeProposal, ProposedFileChange
from iq_core.agents.proposal_fingerprint import proposal_fingerprint


def make_proposal(changes, *, branch="fix/example", rationale="safe change", proposal_id="p-1"):
    return CodeChangeProposal(
        target_branch=branch,
        changes=tuple(changes),
        rationale=rationale,
        proposal_id=proposal_id,
    )


def test_fingerprint_is_stable_for_same_proposal():
    first = make_proposal([
        ProposedFileChange("b.py", "B = 2\n"),
        ProposedFileChange("a.py", "A = 1\n"),
    ])
    second = make_proposal([
        ProposedFileChange("a.py", "A = 1\n"),
        ProposedFileChange("b.py", "B = 2\n"),
    ])
    assert proposal_fingerprint(first) == proposal_fingerprint(second)


def test_fingerprint_changes_when_any_approval_relevant_value_changes():
    original = make_proposal([ProposedFileChange("a.py", "A = 1\n")])
    variants = (
        make_proposal([ProposedFileChange("a.py", "A = 2\n")]),
        make_proposal([ProposedFileChange("a.py", "A = 1\n")], branch="fix/other"),
        make_proposal([ProposedFileChange("a.py", "A = 1\n")], rationale="different"),
        make_proposal([ProposedFileChange("a.py", "A = 1\n")], proposal_id="p-2"),
    )
    original_digest = proposal_fingerprint(original)
    assert all(proposal_fingerprint(item) != original_digest for item in variants)


def test_fingerprint_is_sha256_hex():
    digest = proposal_fingerprint(
        make_proposal([ProposedFileChange("a.py", "A = 1")])
    )
    assert len(digest) == 64
    assert all(character in "0123456789abcdef" for character in digest)


def test_fingerprint_rejects_duplicate_paths_and_invalid_inputs():
    duplicate = make_proposal([
        ProposedFileChange("a.py", "A = 1"),
        ProposedFileChange("a.py", "A = 2"),
    ])
    with pytest.raises(ValueError, match="duplicate"):
        proposal_fingerprint(duplicate)
    with pytest.raises(TypeError, match="CodeChangeProposal"):
        proposal_fingerprint(object())
