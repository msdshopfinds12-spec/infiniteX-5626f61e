"""Fail-closed validation for AI-generated patch manifests.

This module validates an immutable manifest against a previously verified,
persisted approval intent. It does not read/write a repository or apply patches.
"""
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from enum import Enum
from pathlib import PurePosixPath
from typing import Iterable

from iq_core.agents.approval_apply_intent import ApprovalApplyIntent

_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
_COMMIT_RE = re.compile(r"^[0-9a-f]{40}$")
_CONTROL_RE = re.compile(r"[\x00-\x1f\x7f]")
_WINDOWS_DRIVE_RE = re.compile(r"^[A-Za-z]:")

_PROTECTED_EXACT = frozenset({
    ".env", ".env.local", ".env.production", ".npmrc", ".pypirc",
    "id_rsa", "id_ed25519",
})
_PROTECTED_PARTS = frozenset({
    ".git", ".hg", ".svn", "__pycache__", "node_modules",
})
_PROTECTED_PREFIXES = (
    ".github/workflows/",
    ".github/actions/",
)
_PROTECTED_SUFFIXES = (".pem", ".key", ".p12", ".pfx", ".keystore")


class PatchAction(str, Enum):
    ADD = "add"
    MODIFY = "modify"
    DELETE = "delete"


@dataclass(frozen=True)
class PatchFileEntry:
    path: str
    action: PatchAction
    content_sha256: str | None
    size_bytes: int
    is_symlink: bool = False


@dataclass(frozen=True)
class PatchManifest:
    proposal_id: str
    repository_id: str
    target_branch: str
    base_commit_sha: str
    files: tuple[PatchFileEntry, ...]
    manifest_sha256: str


@dataclass(frozen=True)
class PatchPolicy:
    max_files: int = 50
    max_file_bytes: int = 1_000_000
    max_total_bytes: int = 5_000_000
    max_path_length: int = 240
    allowed_target_branch: str = "fix/infiniteX-foundation-hardening"

    def __post_init__(self) -> None:
        for name, value, minimum, maximum in (
            ("max_files", self.max_files, 1, 200),
            ("max_file_bytes", self.max_file_bytes, 1, 5_000_000),
            ("max_total_bytes", self.max_total_bytes, 1, 20_000_000),
            ("max_path_length", self.max_path_length, 16, 512),
        ):
            if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
                raise ValueError(f"PATCH_POLICY_{name.upper()}_INVALID")
        if self.allowed_target_branch in {"main", "master"}:
            raise ValueError("PATCH_POLICY_PROTECTED_BRANCH_INVALID")


@dataclass(frozen=True)
class PatchValidationReport:
    valid: bool
    manifest_sha256: str
    validated_paths: tuple[str, ...]
    total_bytes: int
    error_codes: tuple[str, ...]


def _canonical_manifest_payload(manifest: PatchManifest) -> bytes:
    rows = [
        {
            "path": item.path,
            "action": item.action.value,
            "content_sha256": item.content_sha256,
            "size_bytes": item.size_bytes,
        }
        for item in sorted(manifest.files, key=lambda entry: entry.path)
    ]
    payload = {
        "proposal_id": manifest.proposal_id,
        "repository_id": manifest.repository_id,
        "target_branch": manifest.target_branch,
        "base_commit_sha": manifest.base_commit_sha,
        "files": rows,
    }
    return json.dumps(
        payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True,
        allow_nan=False,
    ).encode("utf-8")


def compute_manifest_sha256(manifest: PatchManifest) -> str:
    """Return the canonical SHA-256 digest excluding the digest field itself."""
    return hashlib.sha256(_canonical_manifest_payload(manifest)).hexdigest()


def _path_error(path: object, policy: PatchPolicy) -> str | None:
    if not isinstance(path, str) or not path or len(path) > policy.max_path_length:
        return "PATCH_PATH_INVALID"
    if _CONTROL_RE.search(path) or "\\" in path or path.startswith("/"):
        return "PATCH_PATH_INVALID"
    if _WINDOWS_DRIVE_RE.match(path):
        return "PATCH_PATH_INVALID"
    parts = path.split("/")
    if any(part in {"", ".", ".."} for part in parts):
        return "PATCH_PATH_TRAVERSAL_REJECTED"
    if any(part.startswith("~") for part in parts):
        return "PATCH_PATH_INVALID"
    normalized = PurePosixPath(path)
    if normalized.is_absolute() or normalized.as_posix() != path:
        return "PATCH_PATH_INVALID"
    lowered = path.casefold()
    if lowered in _PROTECTED_EXACT:
        return "PATCH_PROTECTED_PATH_REJECTED"
    if any(part.casefold() in _PROTECTED_PARTS for part in parts):
        return "PATCH_PROTECTED_PATH_REJECTED"
    if any(lowered.startswith(prefix) for prefix in _PROTECTED_PREFIXES):
        return "PATCH_PROTECTED_PATH_REJECTED"
    if lowered.endswith(_PROTECTED_SUFFIXES):
        return "PATCH_PROTECTED_PATH_REJECTED"
    if any(part.casefold().startswith(".env") for part in parts):
        return "PATCH_PROTECTED_PATH_REJECTED"
    return None


def validate_patch_manifest(
    *,
    manifest: PatchManifest,
    intent: ApprovalApplyIntent,
    policy: PatchPolicy | None = None,
) -> PatchValidationReport:
    """Validate exact approval scope and bounded file metadata; never apply files."""
    policy = policy or PatchPolicy()
    errors: list[str] = []

    if not isinstance(manifest, PatchManifest):
        raise TypeError("PATCH_MANIFEST_REQUIRED")
    if not isinstance(intent, ApprovalApplyIntent):
        raise TypeError("PERSISTED_APPROVAL_INTENT_REQUIRED")
    if not isinstance(manifest.files, tuple):
        errors.append("PATCH_FILES_MUST_BE_IMMUTABLE_TUPLE")
    if not 1 <= len(manifest.files) <= policy.max_files:
        errors.append("PATCH_FILE_COUNT_OUT_OF_RANGE")

    if manifest.proposal_id != intent.proposal_id:
        errors.append("PATCH_PROPOSAL_ID_MISMATCH")
    if manifest.repository_id != intent.repository_id:
        errors.append("PATCH_REPOSITORY_MISMATCH")
    if manifest.target_branch != intent.target_branch:
        errors.append("PATCH_BRANCH_SCOPE_MISMATCH")
    if manifest.target_branch != policy.allowed_target_branch:
        errors.append("PATCH_TARGET_BRANCH_NOT_ALLOWLISTED")
    if manifest.target_branch in {"main", "master"}:
        errors.append("PATCH_PROTECTED_BRANCH_REJECTED")
    if manifest.base_commit_sha != intent.base_commit_sha:
        errors.append("PATCH_BASE_COMMIT_MISMATCH")
    if not isinstance(manifest.base_commit_sha, str) or not _COMMIT_RE.fullmatch(manifest.base_commit_sha):
        errors.append("PATCH_BASE_COMMIT_INVALID")

    paths: list[str] = []
    folded_paths: set[str] = set()
    total_bytes = 0
    for entry in manifest.files:
        if not isinstance(entry, PatchFileEntry):
            errors.append("PATCH_FILE_ENTRY_INVALID")
            continue
        path_issue = _path_error(entry.path, policy)
        if path_issue:
            errors.append(path_issue)
        elif entry.path.casefold() in folded_paths:
            errors.append("PATCH_DUPLICATE_OR_CASE_COLLIDING_PATH")
        else:
            folded_paths.add(entry.path.casefold())
            paths.append(entry.path)

        if entry.is_symlink is not False:
            errors.append("PATCH_SYMLINK_REJECTED")
        if not isinstance(entry.action, PatchAction):
            errors.append("PATCH_ACTION_INVALID")
        if isinstance(entry.size_bytes, bool) or not isinstance(entry.size_bytes, int) or entry.size_bytes < 0:
            errors.append("PATCH_FILE_SIZE_INVALID")
            continue
        if entry.size_bytes > policy.max_file_bytes:
            errors.append("PATCH_FILE_TOO_LARGE")
        total_bytes += entry.size_bytes
        if entry.action is PatchAction.DELETE:
            if entry.content_sha256 is not None or entry.size_bytes != 0:
                errors.append("PATCH_DELETE_MUST_NOT_INCLUDE_CONTENT")
        elif entry.action in {PatchAction.ADD, PatchAction.MODIFY}:
            if not isinstance(entry.content_sha256, str) or not _SHA256_RE.fullmatch(entry.content_sha256):
                errors.append("PATCH_CONTENT_DIGEST_INVALID")
        if entry.action is PatchAction.ADD and entry.path in intent.file_paths:
            # An approved path can be added or modified; the action itself is not
            # inferred from Git state here. This branch intentionally adds no error.
            pass

    if total_bytes > policy.max_total_bytes:
        errors.append("PATCH_TOTAL_SIZE_EXCEEDED")

    approved_paths = set(intent.file_paths)
    if len(approved_paths) != len(intent.file_paths):
        errors.append("APPROVAL_SCOPE_HAS_DUPLICATE_PATHS")
    if set(paths) != approved_paths:
        errors.append("PATCH_PATH_SCOPE_MISMATCH")

    if not isinstance(manifest.manifest_sha256, str) or not _SHA256_RE.fullmatch(manifest.manifest_sha256):
        errors.append("PATCH_MANIFEST_DIGEST_INVALID")
    else:
        calculated = compute_manifest_sha256(manifest)
        if calculated != manifest.manifest_sha256:
            errors.append("PATCH_MANIFEST_DIGEST_MISMATCH")
        if calculated != intent.proposal_sha256:
            errors.append("PATCH_APPROVED_DIGEST_MISMATCH")

    unique_errors = tuple(dict.fromkeys(errors))
    return PatchValidationReport(
        valid=not unique_errors,
        manifest_sha256=manifest.manifest_sha256 if isinstance(manifest.manifest_sha256, str) else "",
        validated_paths=tuple(sorted(paths)),
        total_bytes=total_bytes,
        error_codes=unique_errors,
    )


def build_patch_manifest(
    *,
    proposal_id: str,
    repository_id: str,
    target_branch: str,
    base_commit_sha: str,
    files: Iterable[PatchFileEntry],
) -> PatchManifest:
    """Create a canonical manifest; caller must obtain approval for its digest."""
    draft = PatchManifest(
        proposal_id=proposal_id,
        repository_id=repository_id,
        target_branch=target_branch,
        base_commit_sha=base_commit_sha,
        files=tuple(files),
        manifest_sha256="0" * 64,
    )
    return PatchManifest(
        proposal_id=draft.proposal_id,
        repository_id=draft.repository_id,
        target_branch=draft.target_branch,
        base_commit_sha=draft.base_commit_sha,
        files=draft.files,
        manifest_sha256=compute_manifest_sha256(draft),
    )
