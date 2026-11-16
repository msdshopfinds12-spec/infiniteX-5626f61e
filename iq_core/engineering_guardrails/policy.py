"""Fail-closed validation for AI-generated file proposals.

This module never applies patches, invokes a shell, imports generated code, or
interprets generated content. It only validates metadata and bounded text.
"""

from __future__ import annotations

import re
from pathlib import PurePosixPath

from .contracts import ChangeOperation, PatchProposal, ValidationResult

_SHA1_RE = re.compile(r"^[0-9a-f]{40}$")
_PROPOSAL_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")
_ALLOWED_ROOTS = (
    "backend/app",
    "frontend/src",
    "iq_core",
    "tests",
    "docs/architecture",
    "docs/engineering",
)
_ALLOWED_SUFFIXES = {
    ".css", ".html", ".js", ".jsx", ".json", ".md", ".py",
    ".toml", ".ts", ".tsx", ".yaml", ".yml",
}
_PROTECTED_NAMES = {
    ".env", ".env.local", ".env.production", "package-lock.json",
    "pnpm-lock.yaml", "yarn.lock", "poetry.lock", "uv.lock",
}
_PROTECTED_PARTS = {
    ".github", ".git", ".husky", "alembic", "migrations",
    "secrets", "credentials", "certs", "keys",
}
MAX_FILES = 20
MAX_FILE_BYTES = 256 * 1024
MAX_TOTAL_BYTES = 1024 * 1024


def _path_error(raw_path: str) -> str | None:
    if not raw_path or "\x00" in raw_path:
        return "path is empty or contains a NUL byte"
    if "\\" in raw_path:
        return "path must use POSIX separators"
    if raw_path.startswith("/") or re.match(r"^[A-Za-z]:", raw_path):
        return "absolute paths are forbidden"

    path = PurePosixPath(raw_path)
    parts = path.parts
    if not parts or any(part in {"", ".", ".."} for part in parts):
        return "path traversal or ambiguous path component detected"
    if path.as_posix() != raw_path:
        return "path is not normalized"
    if any(part in _PROTECTED_PARTS for part in parts):
        return "protected repository area cannot be modified by generated proposals"
    if path.name in _PROTECTED_NAMES or path.name.startswith(".env."):
        return "environment or dependency lock files are protected"
    if path.suffix.lower() not in _ALLOWED_SUFFIXES:
        return "file extension is not in the proposal allowlist"
    if not any(raw_path.startswith(root + "/") for root in _ALLOWED_ROOTS):
        return "path is outside approved source, test, and documentation roots"
    return None


def validate_proposal(proposal: PatchProposal) -> ValidationResult:
    """Validate a proposal without applying or executing any proposed content."""
    reasons: list[str] = []

    if not _PROPOSAL_ID_RE.fullmatch(proposal.proposal_id):
        reasons.append("proposal_id must be a bounded identifier")
    if not _SHA1_RE.fullmatch(proposal.base_commit):
        reasons.append("base_commit must be an exact 40-character Git commit SHA")
    if not proposal.changes:
        reasons.append("proposal must contain at least one file change")
    if len(proposal.changes) > MAX_FILES:
        reasons.append(f"proposal exceeds the {MAX_FILES}-file limit")

    seen: set[str] = set()
    total_bytes = 0
    for change in proposal.changes:
        if change.path in seen:
            reasons.append(f"duplicate path: {change.path}")
        seen.add(change.path)

        path_error = _path_error(change.path)
        if path_error:
            reasons.append(f"{change.path}: {path_error}")

        if change.operation is ChangeOperation.DELETE:
            reasons.append(f"{change.path}: generated deletion is forbidden")
        elif change.operation not in {ChangeOperation.CREATE, ChangeOperation.UPDATE}:
            reasons.append(f"{change.path}: unsupported operation")

        if not isinstance(change.content, str):
            reasons.append(f"{change.path}: content must be UTF-8 text")
            continue
        try:
            encoded = change.content.encode("utf-8", errors="strict")
        except UnicodeEncodeError:
            reasons.append(f"{change.path}: content is not valid UTF-8")
            continue

        if b"\x00" in encoded:
            reasons.append(f"{change.path}: binary/NUL content is forbidden")
        if len(encoded) > MAX_FILE_BYTES:
            reasons.append(f"{change.path}: exceeds the per-file byte limit")
        total_bytes += len(encoded)

    if total_bytes > MAX_TOTAL_BYTES:
        reasons.append("proposal exceeds the aggregate byte limit")

    return ValidationResult(
        accepted=not reasons,
        reasons=tuple(reasons),
        file_count=len(proposal.changes),
        total_bytes=total_bytes,
    )
