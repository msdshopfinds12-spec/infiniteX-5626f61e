import pytest

from iq_core.agents.approval_apply_intent import ApprovalApplyIntent
from iq_core.execution.patch_manifest import (
    PatchAction,
    PatchFileEntry,
    PatchPolicy,
    build_patch_manifest,
    validate_patch_manifest,
)


def intent_for(manifest):
    return ApprovalApplyIntent(
        nonce_id="nonce-1",
        reviewer_subject="reviewer-1",
        reviewer_role="owner",
        repository_id=manifest.repository_id,
        target_branch=manifest.target_branch,
        base_commit_sha=manifest.base_commit_sha,
        proposal_id=manifest.proposal_id,
        proposal_sha256=manifest.manifest_sha256,
        policy_version="policy-v1",
        file_paths=tuple(item.path for item in manifest.files),
        issued_at=100,
        expires_at=200,
    )


def valid_manifest(files=None, **overrides):
    values = {
        "proposal_id": "proposal-1",
        "repository_id": "repo-1",
        "target_branch": "fix/infiniteX-foundation-hardening",
        "base_commit_sha": "a" * 40,
        "files": files or (
            PatchFileEntry(
                path="iq_core/example.py",
                action=PatchAction.ADD,
                content_sha256="b" * 64,
                size_bytes=128,
            ),
        ),
    }
    values.update(overrides)
    return build_patch_manifest(**values)


def test_valid_manifest_matches_exact_approved_scope():
    manifest = valid_manifest()
    report = validate_patch_manifest(manifest=manifest, intent=intent_for(manifest))
    assert report.valid
    assert report.validated_paths == ("iq_core/example.py",)
    assert report.total_bytes == 128


@pytest.mark.parametrize("path", [
    "../escape.py", "iq_core/../../escape.py", "/etc/passwd",
    "C:/Windows/system.ini", "iq_core\\escape.py", "iq_core//empty.py",
])
def test_rejects_traversal_and_non_portable_paths(path):
    manifest = valid_manifest(files=(
        PatchFileEntry(path, PatchAction.ADD, "b" * 64, 1),
    ))
    report = validate_patch_manifest(manifest=manifest, intent=intent_for(manifest))
    assert not report.valid
    assert any(code in report.error_codes for code in (
        "PATCH_PATH_INVALID", "PATCH_PATH_TRAVERSAL_REJECTED",
    ))


@pytest.mark.parametrize("path", [
    ".env", ".env.production", ".git/config", ".github/workflows/release.yml",
    "backend/secrets/private.pem", "keys/service.key", "node_modules/pkg/index.js",
])
def test_rejects_protected_paths(path):
    manifest = valid_manifest(files=(
        PatchFileEntry(path, PatchAction.ADD, "b" * 64, 1),
    ))
    report = validate_patch_manifest(manifest=manifest, intent=intent_for(manifest))
    assert "PATCH_PROTECTED_PATH_REJECTED" in report.error_codes


def test_rejects_symlink_entries():
    manifest = valid_manifest(files=(
        PatchFileEntry("iq_core/link.py", PatchAction.ADD, "b" * 64, 1, True),
    ))
    report = validate_patch_manifest(manifest=manifest, intent=intent_for(manifest))
    assert "PATCH_SYMLINK_REJECTED" in report.error_codes


def test_rejects_case_insensitive_path_collisions():
    manifest = valid_manifest(files=(
        PatchFileEntry("src/Config.py", PatchAction.ADD, "b" * 64, 1),
        PatchFileEntry("src/config.py", PatchAction.ADD, "c" * 64, 1),
    ))
    report = validate_patch_manifest(manifest=manifest, intent=intent_for(manifest))
    assert "PATCH_DUPLICATE_OR_CASE_COLLIDING_PATH" in report.error_codes


def test_rejects_file_and_total_size_overflow():
    policy = PatchPolicy(max_file_bytes=10, max_total_bytes=12)
    manifest = valid_manifest(files=(
        PatchFileEntry("src/a.py", PatchAction.ADD, "b" * 64, 11),
        PatchFileEntry("src/b.py", PatchAction.ADD, "c" * 64, 2),
    ))
    report = validate_patch_manifest(manifest=manifest, intent=intent_for(manifest), policy=policy)
    assert "PATCH_FILE_TOO_LARGE" in report.error_codes
    assert "PATCH_TOTAL_SIZE_EXCEEDED" in report.error_codes


def test_rejects_protected_branch_even_if_approval_matches():
    manifest = valid_manifest(target_branch="main")
    report = validate_patch_manifest(manifest=manifest, intent=intent_for(manifest))
    assert "PATCH_TARGET_BRANCH_NOT_ALLOWLISTED" in report.error_codes
    assert "PATCH_PROTECTED_BRANCH_REJECTED" in report.error_codes


def test_rejects_path_scope_mismatch():
    manifest = valid_manifest()
    intent = ApprovalApplyIntent(
        nonce_id="nonce-1", reviewer_subject="reviewer-1", reviewer_role="owner",
        repository_id=manifest.repository_id, target_branch=manifest.target_branch,
        base_commit_sha=manifest.base_commit_sha, proposal_id=manifest.proposal_id,
        proposal_sha256=manifest.manifest_sha256, policy_version="policy-v1",
        file_paths=("another/file.py",), issued_at=100, expires_at=200,
    )
    report = validate_patch_manifest(manifest=manifest, intent=intent)
    assert "PATCH_PATH_SCOPE_MISMATCH" in report.error_codes


def test_rejects_manifest_digest_tampering():
    manifest = valid_manifest()
    tampered = type(manifest)(
        proposal_id=manifest.proposal_id,
        repository_id=manifest.repository_id,
        target_branch=manifest.target_branch,
        base_commit_sha=manifest.base_commit_sha,
        files=(PatchFileEntry("iq_core/changed.py", PatchAction.ADD, "c" * 64, 128),),
        manifest_sha256=manifest.manifest_sha256,
    )
    report = validate_patch_manifest(manifest=tampered, intent=intent_for(manifest))
    assert "PATCH_MANIFEST_DIGEST_MISMATCH" in report.error_codes
    assert "PATCH_PATH_SCOPE_MISMATCH" in report.error_codes


def test_rejects_delete_with_content():
    manifest = valid_manifest(files=(
        PatchFileEntry("iq_core/old.py", PatchAction.DELETE, "b" * 64, 10),
    ))
    report = validate_patch_manifest(manifest=manifest, intent=intent_for(manifest))
    assert "PATCH_DELETE_MUST_NOT_INCLUDE_CONTENT" in report.error_codes
