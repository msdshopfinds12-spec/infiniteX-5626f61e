from iq_core.agents.code_change_policy import (
    CodeChangePolicy,
    CodeChangeProposal,
    ProposedFileChange,
)


def proposal(*changes, branch="fix/infiniteX-foundation-hardening"):
    return CodeChangeProposal(
        target_branch=branch,
        changes=tuple(changes),
        rationale="Improve the guarded code-generation workflow",
        proposal_id="proposal-test-001",
    )


def test_valid_proposal_requires_human_review_and_never_auto_applies():
    decision = CodeChangePolicy().evaluate(
        proposal(ProposedFileChange("iq_core/example.py", "VALUE = 1\n"))
    )
    assert decision.status == "REVIEW_REQUIRED"
    assert "HUMAN_APPROVAL_REQUIRED" in decision.reason_codes
    assert "NO_AUTOMATIC_WRITE_OR_EXECUTION" in decision.reason_codes


def test_protected_branches_are_rejected():
    for branch in ("main", "master", "phase-9/capability-mesh"):
        decision = CodeChangePolicy().evaluate(
            proposal(ProposedFileChange("iq_core/example.py", "VALUE = 1"), branch=branch)
        )
        assert decision.status == "BLOCKED"
        assert "PROTECTED_BRANCH_FORBIDDEN" in decision.reason_codes


def test_unapproved_or_empty_branch_namespace_is_rejected():
    for branch in ("release/production", "fix/"):
        decision = CodeChangePolicy().evaluate(
            proposal(ProposedFileChange("iq_core/example.py", "VALUE = 1"), branch=branch)
        )
        assert decision.status == "BLOCKED"
        assert "UNAPPROVED_BRANCH_NAMESPACE" in decision.reason_codes

    missing = CodeChangePolicy().evaluate(
        proposal(ProposedFileChange("iq_core/example.py", "VALUE = 1"), branch="")
    )
    assert "TARGET_BRANCH_REQUIRED" in missing.reason_codes


def test_path_traversal_and_repository_control_paths_are_rejected():
    for path, expected in (
        ("../outside.py", "PATH_TRAVERSAL_FORBIDDEN"),
        ("folder/../outside.py", "PATH_TRAVERSAL_FORBIDDEN"),
        (".", "PATH_TRAVERSAL_FORBIDDEN"),
        (".git/config", "REPOSITORY_CONTROL_PATH_FORBIDDEN"),
        (".github/workflows/ci.yml", "REPOSITORY_CONTROL_PATH_FORBIDDEN"),
        ("/absolute/path.py", "UNSAFE_FILE_PATH"),
    ):
        decision = CodeChangePolicy().evaluate(
            proposal(ProposedFileChange(path, "VALUE = 1"))
        )
        assert decision.status == "BLOCKED"
        assert expected in decision.reason_codes


def test_sensitive_paths_are_rejected():
    for path in (".env", "config/.env.production", "keys/server.pem", "secrets/token.txt"):
        decision = CodeChangePolicy().evaluate(
            proposal(ProposedFileChange(path, "placeholder"))
        )
        assert decision.status == "BLOCKED"
        assert "SENSITIVE_FILE_PATH_FORBIDDEN" in decision.reason_codes


def test_secret_like_content_is_rejected_without_echoing_content():
    decision = CodeChangePolicy().evaluate(
        proposal(ProposedFileChange("config.py", "PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----'"))
    )
    assert decision.status == "BLOCKED"
    assert "POSSIBLE_SECRET_IN_CONTENT" in decision.reason_codes


def test_duplicate_paths_are_rejected():
    decision = CodeChangePolicy().evaluate(
        proposal(
            ProposedFileChange("iq_core/a.py", "A = 1"),
            ProposedFileChange("iq_core/a.py", "A = 2"),
        )
    )
    assert decision.status == "BLOCKED"
    assert "DUPLICATE_FILE_PATH" in decision.reason_codes


def test_file_and_proposal_size_limits_are_enforced():
    policy = CodeChangePolicy()
    oversized_file = policy.evaluate(
        proposal(ProposedFileChange("large.txt", "x" * (policy.MAX_FILE_BYTES + 1)))
    )
    assert "FILE_TOO_LARGE" in oversized_file.reason_codes

    oversized_total = policy.evaluate(
        proposal(
            ProposedFileChange("a.txt", "a" * 150_000),
            ProposedFileChange("b.txt", "b" * 150_000),
            ProposedFileChange("c.txt", "c" * 150_000),
            ProposedFileChange("d.txt", "d" * 150_000),
            ProposedFileChange("e.txt", "e" * 150_000),
            ProposedFileChange("f.txt", "f" * 150_000),
            ProposedFileChange("g.txt", "g" * 150_000),
        )
    )
    assert "PROPOSAL_TOO_LARGE" in oversized_total.reason_codes


def test_empty_and_too_many_file_changes_are_rejected():
    empty = CodeChangePolicy().evaluate(
        CodeChangeProposal("fix/example", (), "reason", "proposal-1")
    )
    assert "CHANGES_REQUIRED" in empty.reason_codes

    too_many = CodeChangePolicy().evaluate(
        CodeChangeProposal(
            "fix/example",
            tuple(ProposedFileChange(f"f{i}.txt", "x") for i in range(21)),
            "reason",
            "proposal-2",
        )
    )
    assert "TOO_MANY_FILES" in too_many.reason_codes
