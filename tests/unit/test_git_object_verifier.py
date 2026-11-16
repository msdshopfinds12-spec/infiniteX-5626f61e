import hashlib

from iq_core.agents.approval_apply_intent import ApprovalApplyIntent
from iq_core.execution.git_object_verifier import (
    GitTreeEntry,
    git_blob_sha1,
    verify_git_snapshot,
)
from iq_core.execution.patch_manifest import (
    PatchAction,
    PatchFileEntry,
    build_patch_manifest,
)


BASE = "a" * 40


def make_manifest(action=PatchAction.ADD, path="src/new.py", content=b"print('ok')"):
    entry = PatchFileEntry(
        path=path,
        action=action,
        content_sha256=hashlib.sha256(content).hexdigest() if action is not PatchAction.DELETE else None,
        size_bytes=len(content) if action is not PatchAction.DELETE else 0,
    )
    return build_patch_manifest(
        proposal_id="proposal-1",
        repository_id="repo-1",
        target_branch="fix/infiniteX-foundation-hardening",
        base_commit_sha=BASE,
        files=(entry,),
    )


def make_intent(manifest):
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


def test_git_blob_sha1_uses_git_object_header():
    assert git_blob_sha1(b"hello") == "b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0"


def test_add_requires_absent_base_path_and_matching_proposed_blob():
    content = b"print('ok')"
    manifest = make_manifest(content=content)
    report = verify_git_snapshot(
        manifest=manifest,
        intent=make_intent(manifest),
        tree_entries=(),
        base_blob_contents={},
        proposed_blob_contents={"src/new.py": content},
    )
    assert report.valid
    assert report.verified_paths == ("src/new.py",)


def test_add_rejects_existing_path():
    content = b"print('ok')"
    manifest = make_manifest(content=content)
    report = verify_git_snapshot(
        manifest=manifest,
        intent=make_intent(manifest),
        tree_entries=(GitTreeEntry("src/new.py", "100644", "blob", "b" * 40),),
        base_blob_contents={},
        proposed_blob_contents={"src/new.py": content},
    )
    assert "GIT_ADD_PATH_ALREADY_EXISTS" in report.error_codes


def test_modify_verifies_base_git_blob_and_proposed_sha256():
    old, new = b"old", b"new"
    manifest = make_manifest(PatchAction.MODIFY, "src/app.py", new)
    report = verify_git_snapshot(
        manifest=manifest,
        intent=make_intent(manifest),
        tree_entries=(GitTreeEntry("src/app.py", "100644", "blob", git_blob_sha1(old)),),
        base_blob_contents={"src/app.py": old},
        proposed_blob_contents={"src/app.py": new},
    )
    assert report.valid
    assert report.verified_blob_count == 2


def test_delete_requires_existing_regular_blob_and_no_new_content():
    old = b"obsolete"
    manifest = make_manifest(PatchAction.DELETE, "src/old.py")
    report = verify_git_snapshot(
        manifest=manifest,
        intent=make_intent(manifest),
        tree_entries=(GitTreeEntry("src/old.py", "100644", "blob", git_blob_sha1(old)),),
        base_blob_contents={"src/old.py": old},
        proposed_blob_contents={},
    )
    assert report.valid


def test_rejects_symlink_tree_mode():
    old = b"target"
    manifest = make_manifest(PatchAction.MODIFY, "src/link.py", b"new")
    report = verify_git_snapshot(
        manifest=manifest,
        intent=make_intent(manifest),
        tree_entries=(GitTreeEntry("src/link.py", "120000", "blob", git_blob_sha1(old)),),
        base_blob_contents={"src/link.py": old},
        proposed_blob_contents={"src/link.py": b"new"},
    )
    assert "GIT_UNSAFE_TREE_MODE_REJECTED" in report.error_codes


def test_rejects_submodule_and_non_blob_objects():
    manifest = make_manifest(PatchAction.MODIFY, "vendor/lib", b"new")
    report = verify_git_snapshot(
        manifest=manifest,
        intent=make_intent(manifest),
        tree_entries=(GitTreeEntry("vendor/lib", "160000", "commit", "c" * 40),),
        base_blob_contents={"vendor/lib": b"submodule"},
        proposed_blob_contents={"vendor/lib": b"new"},
    )
    assert "GIT_UNSAFE_TREE_MODE_REJECTED" in report.error_codes
    assert "GIT_NON_BLOB_OBJECT_REJECTED" in report.error_codes


def test_rejects_base_blob_tampering():
    manifest = make_manifest(PatchAction.MODIFY, "src/app.py", b"new")
    report = verify_git_snapshot(
        manifest=manifest,
        intent=make_intent(manifest),
        tree_entries=(GitTreeEntry("src/app.py", "100644", "blob", "d" * 40),),
        base_blob_contents={"src/app.py": b"old"},
        proposed_blob_contents={"src/app.py": b"new"},
    )
    assert "GIT_BASE_BLOB_SHA_MISMATCH" in report.error_codes


def test_rejects_mismatched_proposed_content():
    manifest = make_manifest(content=b"expected")
    report = verify_git_snapshot(
        manifest=manifest,
        intent=make_intent(manifest),
        tree_entries=(),
        base_blob_contents={},
        proposed_blob_contents={"src/new.py": b"tampered"},
    )
    assert "GIT_PROPOSED_BLOB_SHA256_MISMATCH" in report.error_codes


def test_rejects_truncated_tree_response():
    content = b"print('ok')"
    manifest = make_manifest(content=content)
    report = verify_git_snapshot(
        manifest=manifest,
        intent=make_intent(manifest),
        tree_entries=(),
        base_blob_contents={},
        proposed_blob_contents={"src/new.py": content},
        tree_truncated=True,
    )
    assert "GIT_TREE_RESPONSE_TRUNCATED" in report.error_codes
