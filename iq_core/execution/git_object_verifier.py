"""Verify Git tree metadata and patch bytes against an approved manifest.

This is a pure validation boundary. A trusted adapter must fetch the exact base
commit/tree and blobs, decode them, and pass complete inputs here. No writes,
network access, patch application, or subprocess execution occur in this module.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Mapping

from iq_core.agents.approval_apply_intent import ApprovalApplyIntent
from iq_core.execution.patch_manifest import (
    PatchAction,
    PatchManifest,
    PatchPolicy,
    validate_patch_manifest,
)

_ALLOWED_BLOB_MODES = frozenset({"100644", "100755"})
_MAX_TREE_ENTRIES = 100_000


@dataclass(frozen=True)
class GitTreeEntry:
    path: str
    mode: str
    object_type: str
    sha: str


@dataclass(frozen=True)
class GitObjectVerificationReport:
    valid: bool
    base_commit_sha: str
    verified_paths: tuple[str, ...]
    verified_blob_count: int
    error_codes: tuple[str, ...]


def git_blob_sha1(content: bytes) -> str:
    """Compute Git's canonical SHA-1 object ID for a blob's raw bytes."""
    if not isinstance(content, bytes):
        raise TypeError("GIT_BLOB_CONTENT_MUST_BE_BYTES")
    header = f"blob {len(content)}\\0".encode("ascii")
    return hashlib.sha1(header + content).hexdigest()


def _is_sha1(value: object) -> bool:
    return (
        isinstance(value, str)
        and len(value) == 40
        and all(char in "0123456789abcdef" for char in value)
    )


def verify_git_snapshot(
    *,
    manifest: PatchManifest,
    intent: ApprovalApplyIntent,
    tree_entries: tuple[GitTreeEntry, ...],
    base_blob_contents: Mapping[str, bytes],
    proposed_blob_contents: Mapping[str, bytes],
    tree_truncated: bool = False,
    policy: PatchPolicy | None = None,
) -> GitObjectVerificationReport:
    """Verify touched base Git objects and proposed content; never mutate Git.

    tree_entries must come from the recursive tree for manifest.base_commit_sha.
    base_blob_contents contains raw bytes for every existing touched path.
    proposed_blob_contents contains raw bytes for every add/modify path.
    A caller must reject an incomplete/truncated Git tree response.
    """
    errors: list[str] = []
    if not isinstance(manifest, PatchManifest):
        raise TypeError("PATCH_MANIFEST_REQUIRED")
    if not isinstance(intent, ApprovalApplyIntent):
        raise TypeError("PERSISTED_APPROVAL_INTENT_REQUIRED")
    if not isinstance(tree_entries, tuple):
        raise TypeError("GIT_TREE_ENTRIES_MUST_BE_IMMUTABLE_TUPLE")
    if len(tree_entries) > _MAX_TREE_ENTRIES:
        errors.append("GIT_TREE_ENTRY_LIMIT_EXCEEDED")
    if tree_truncated:
        errors.append("GIT_TREE_RESPONSE_TRUNCATED")

    manifest_report = validate_patch_manifest(
        manifest=manifest, intent=intent, policy=policy
    )
    errors.extend(manifest_report.error_codes)

    by_path: dict[str, GitTreeEntry] = {}
    folded: set[str] = set()
    for entry in tree_entries:
        if not isinstance(entry, GitTreeEntry):
            errors.append("GIT_TREE_ENTRY_INVALID")
            continue
        if not isinstance(entry.path, str) or not entry.path:
            errors.append("GIT_TREE_PATH_INVALID")
            continue
        key = entry.path.casefold()
        if key in folded:
            errors.append("GIT_TREE_DUPLICATE_OR_CASE_COLLISION")
            continue
        folded.add(key)
        by_path[entry.path] = entry

    expected_base = manifest.base_commit_sha
    if expected_base != intent.base_commit_sha:
        errors.append("GIT_BASE_COMMIT_SCOPE_MISMATCH")

    verified_paths: list[str] = []
    verified_blobs = 0
    expected_base_paths: set[str] = set()
    expected_proposed_paths: set[str] = set()

    for item in manifest.files:
        path = item.path
        existing = by_path.get(path)
        if item.action is PatchAction.ADD:
            if existing is not None:
                errors.append("GIT_ADD_PATH_ALREADY_EXISTS")
            if path in base_blob_contents:
                errors.append("GIT_UNEXPECTED_BASE_BLOB")
            expected_proposed_paths.add(path)
        elif item.action in {PatchAction.MODIFY, PatchAction.DELETE}:
            if existing is None:
                errors.append("GIT_BASE_PATH_MISSING")
            else:
                expected_base_paths.add(path)
                if existing.mode not in _ALLOWED_BLOB_MODES:
                    errors.append("GIT_UNSAFE_TREE_MODE_REJECTED")
                if existing.object_type != "blob":
                    errors.append("GIT_NON_BLOB_OBJECT_REJECTED")
                if not _is_sha1(existing.sha):
                    errors.append("GIT_TREE_OBJECT_SHA_INVALID")
                content = base_blob_contents.get(path)
                if not isinstance(content, bytes):
                    errors.append("GIT_BASE_BLOB_CONTENT_MISSING")
                elif _is_sha1(existing.sha) and git_blob_sha1(content) != existing.sha:
                    errors.append("GIT_BASE_BLOB_SHA_MISMATCH")
                else:
                    verified_blobs += 1
            if item.action is PatchAction.MODIFY:
                expected_proposed_paths.add(path)
            elif path in proposed_blob_contents:
                errors.append("GIT_DELETE_HAS_PROPOSED_CONTENT")

        if item.action in {PatchAction.ADD, PatchAction.MODIFY}:
            content = proposed_blob_contents.get(path)
            if not isinstance(content, bytes):
                errors.append("GIT_PROPOSED_BLOB_CONTENT_MISSING")
            else:
                verified_blobs += 1
                if len(content) != item.size_bytes:
                    errors.append("GIT_PROPOSED_BLOB_SIZE_MISMATCH")
                digest = hashlib.sha256(content).hexdigest()
                if digest != item.content_sha256:
                    errors.append("GIT_PROPOSED_BLOB_SHA256_MISMATCH")
                else:
                    verified_paths.append(path)

    if set(base_blob_contents) != expected_base_paths:
        errors.append("GIT_BASE_BLOB_SET_MISMATCH")
    if set(proposed_blob_contents) != expected_proposed_paths:
        errors.append("GIT_PROPOSED_BLOB_SET_MISMATCH")

    unique_errors = tuple(dict.fromkeys(errors))
    return GitObjectVerificationReport(
        valid=not unique_errors,
        base_commit_sha=expected_base,
        verified_paths=tuple(sorted(set(verified_paths))),
        verified_blob_count=verified_blobs,
        error_codes=unique_errors,
    )
