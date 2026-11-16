"""Regression tests for fail-closed AI proposal validation."""

from iq_core.engineering_guardrails import (
    ChangeOperation,
    FileChange,
    PatchProposal,
    validate_proposal,
)

BASE = "a" * 40


def proposal(path: str = "backend/app/example.py", content: str = "VALUE = 1\n"):
    return PatchProposal(
        proposal_id="proposal-001",
        base_commit=BASE,
        changes=(FileChange(path, ChangeOperation.CREATE, content),),
    )


def test_accepts_bounded_source_proposal():
    result = validate_proposal(proposal())
    assert result.accepted
    assert result.reasons == ()
    assert result.file_count == 1


def test_rejects_path_traversal():
    result = validate_proposal(proposal("../.env"))
    assert not result.accepted
    assert any("traversal" in reason or "absolute" in reason for reason in result.reasons)


def test_rejects_absolute_path():
    result = validate_proposal(proposal("/tmp/payload.py"))
    assert not result.accepted


def test_rejects_github_workflow_changes():
    result = validate_proposal(proposal(".github/workflows/ci.yml"))
    assert not result.accepted
    assert any("protected repository area" in reason for reason in result.reasons)


def test_rejects_environment_and_lock_files():
    assert not validate_proposal(proposal("backend/app/.env")).accepted
    assert not validate_proposal(proposal("frontend/src/package-lock.json")).accepted


def test_rejects_deletions():
    item = FileChange("backend/app/example.py", ChangeOperation.DELETE, "")
    result = validate_proposal(PatchProposal("proposal-001", BASE, (item,)))
    assert not result.accepted


def test_rejects_invalid_base_commit():
    result = validate_proposal(
        PatchProposal("proposal-001", "not-a-sha", (FileChange(
            "backend/app/example.py", ChangeOperation.CREATE, "x"
        ),))
    )
    assert not result.accepted


def test_rejects_duplicate_paths():
    change = FileChange("backend/app/example.py", ChangeOperation.CREATE, "x")
    result = validate_proposal(PatchProposal("proposal-001", BASE, (change, change)))
    assert not result.accepted
    assert any("duplicate path" in reason for reason in result.reasons)


def test_rejects_binary_content():
    result = validate_proposal(proposal(content="bad\x00content"))
    assert not result.accepted


def test_rejects_oversized_file():
    result = validate_proposal(proposal(content="x" * (256 * 1024 + 1)))
    assert not result.accepted


def test_rejects_unapproved_root_and_extension():
    assert not validate_proposal(proposal("scripts/run.sh")).accepted
    assert not validate_proposal(proposal("backend/app/payload.bin")).accepted
