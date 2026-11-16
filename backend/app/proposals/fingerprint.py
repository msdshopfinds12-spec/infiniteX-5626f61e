"""Versioned canonical fingerprint contract for trusted proposals."""
from __future__ import annotations

import hashlib
import json
from typing import Any

FINGERPRINT_SCHEMA_VERSION = 2
DEFAULT_POLICY_VERSION = "trusted-proposal-policy/1"


def canonical_manifest(files: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return a deterministic manifest containing only approval-bound fields."""
    normalized: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in files:
        path = item.get("path")
        digest = item.get("sha256")
        byte_length = item.get("byte_length")
        if not isinstance(path, str) or not path:
            raise ValueError("manifest path is required")
        if path in seen:
            raise ValueError("manifest contains duplicate paths")
        if not isinstance(digest, str) or len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
            raise ValueError("manifest sha256 must be lowercase hexadecimal")
        if isinstance(byte_length, bool) or not isinstance(byte_length, int) or byte_length < 0:
            raise ValueError("manifest byte_length must be a non-negative integer")
        seen.add(path)
        normalized.append({"path": path, "sha256": digest, "byte_length": byte_length})
    if not normalized:
        raise ValueError("proposal manifest must not be empty")
    return sorted(normalized, key=lambda entry: entry["path"])


def proposal_fingerprint(*, tenant_id: str, proposal_id: str, repository_id: int,
                         repository_full_name: str, target_branch: str,
                         base_commit_sha: str, files: list[dict[str, Any]],
                         policy_version: str = DEFAULT_POLICY_VERSION) -> str:
    """SHA-256 over every server-trusted field that an approval must bind to."""
    if isinstance(repository_id, bool) or not isinstance(repository_id, int) or repository_id <= 0:
        raise ValueError("repository_id must be a positive integer")
    if len(base_commit_sha) != 40 or any(c not in "0123456789abcdef" for c in base_commit_sha):
        raise ValueError("base_commit_sha must be a lowercase 40-character Git SHA")
    manifest = canonical_manifest(files)
    document = {
        "fingerprint_schema_version": FINGERPRINT_SCHEMA_VERSION,
        "tenant_id": tenant_id,
        "proposal_id": proposal_id,
        "repository_id": repository_id,
        "repository_full_name": repository_full_name,
        "target_branch": target_branch,
        "base_commit_sha": base_commit_sha,
        "policy_version": policy_version,
        "file_manifest": manifest,
    }
    encoded = json.dumps(document, ensure_ascii=False, sort_keys=True,
                         separators=(",", ":"), allow_nan=False).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()
