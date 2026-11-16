"""Read-only GitHub Git-object retrieval and verification adapter.

The transport is injected and must implement authenticated, read-only GitHub
REST GET requests. This module never writes Git objects, refs, commits, or files.
"""
from __future__ import annotations

import base64
import binascii
import re
from dataclasses import dataclass
from typing import Mapping, Protocol

from iq_core.agents.approval_apply_intent import ApprovalApplyIntent
from iq_core.execution.git_object_verifier import (
    GitObjectVerificationReport,
    GitTreeEntry,
    git_blob_sha1,
    verify_git_snapshot,
)
from iq_core.execution.patch_manifest import PatchManifest, PatchPolicy

_REPO_SEGMENT_RE = re.compile(r"^[A-Za-z0-9_.-]+$")
_SHA1_RE = re.compile(r"^[0-9a-f]{40}$")
_DEFAULT_API = "https://api.github.com"
_MAX_TREE_ENTRIES = 100_000
_MAX_BLOB_BYTES = 1_000_000
_MAX_TOTAL_BLOB_BYTES = 5_000_000


class GitHubReadError(RuntimeError):
    """Raised when GitHub data is absent, malformed, incomplete, or unsafe."""


class ReadOnlyGitHubTransport(Protocol):
    """Injected transport: GET only; no generic request or write method."""

    def get_json(self, url: str) -> Mapping[str, object]:
        """Return one decoded JSON object for an HTTPS GitHub API URL."""
        ...


@dataclass(frozen=True)
class RetrievedGitSnapshot:
    commit_sha: str
    tree_sha: str
    tree_entries: tuple[GitTreeEntry, ...]
    base_blob_contents: Mapping[str, bytes]


class GitHubReadOnlyObjectAdapter:
    """Fetch an exact commit/tree and touched raw blobs, then verify the snapshot."""

    def __init__(
        self,
        *,
        transport: ReadOnlyGitHubTransport,
        repository_full_name: str,
        repository_id: str,
        api_base_url: str = _DEFAULT_API,
        max_tree_entries: int = _MAX_TREE_ENTRIES,
        max_blob_bytes: int = _MAX_BLOB_BYTES,
        max_total_blob_bytes: int = _MAX_TOTAL_BLOB_BYTES,
    ) -> None:
        parts = (
            repository_full_name.split("/")
            if isinstance(repository_full_name, str)
            else []
        )
        if (
            len(parts) != 2
            or any(
                part in {"", ".", ".."} or not _REPO_SEGMENT_RE.fullmatch(part)
                for part in parts
            )
        ):
            raise ValueError("GITHUB_REPOSITORY_NAME_INVALID")
        if not isinstance(repository_id, str) or not repository_id.strip() or len(repository_id) > 128:
            raise ValueError("GITHUB_REPOSITORY_ID_INVALID")
        if api_base_url != _DEFAULT_API:
            raise ValueError("GITHUB_API_BASE_URL_NOT_ALLOWLISTED")
        for name, value, upper in (
            ("max_tree_entries", max_tree_entries, _MAX_TREE_ENTRIES),
            ("max_blob_bytes", max_blob_bytes, _MAX_BLOB_BYTES),
            ("max_total_blob_bytes", max_total_blob_bytes, _MAX_TOTAL_BLOB_BYTES),
        ):
            if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= upper:
                raise ValueError(f"GITHUB_{name.upper()}_INVALID")
        self._transport = transport
        self._repository = repository_full_name
        self._repository_id = repository_id
        self._api = api_base_url
        self._max_tree_entries = max_tree_entries
        self._max_blob_bytes = max_blob_bytes
        self._max_total_blob_bytes = max_total_blob_bytes

    def retrieve_snapshot(self, *, base_commit_sha: str, paths: tuple[str, ...]) -> RetrievedGitSnapshot:
        if not isinstance(base_commit_sha, str) or not _SHA1_RE.fullmatch(base_commit_sha):
            raise GitHubReadError("GITHUB_BASE_COMMIT_SHA_INVALID")
        if not isinstance(paths, tuple) or not paths or any(not isinstance(p, str) or not p for p in paths):
            raise GitHubReadError("GITHUB_TOUCHED_PATHS_INVALID")
        if len(set(paths)) != len(paths):
            raise GitHubReadError("GITHUB_TOUCHED_PATHS_DUPLICATE")

        commit_url = f"{self._api}/repos/{self._repository}/git/commits/{base_commit_sha}"
        commit = self._get_object(commit_url, "GITHUB_COMMIT_RESPONSE_INVALID")
        if commit.get("sha") != base_commit_sha:
            raise GitHubReadError("GITHUB_COMMIT_SHA_MISMATCH")
        tree_obj = commit.get("tree")
        if not isinstance(tree_obj, dict):
            raise GitHubReadError("GITHUB_COMMIT_TREE_MISSING")
        tree_sha = tree_obj.get("sha")
        if not isinstance(tree_sha, str) or not _SHA1_RE.fullmatch(tree_sha):
            raise GitHubReadError("GITHUB_TREE_SHA_INVALID")

        tree_url = f"{self._api}/repos/{self._repository}/git/trees/{tree_sha}?recursive=1"
        tree_payload = self._get_object(tree_url, "GITHUB_TREE_RESPONSE_INVALID")
        if tree_payload.get("sha") != tree_sha:
            raise GitHubReadError("GITHUB_TREE_SHA_MISMATCH")
        if tree_payload.get("truncated") is not False:
            raise GitHubReadError("GITHUB_TREE_TRUNCATED_OR_UNCONFIRMED")
        raw_entries = tree_payload.get("tree")
        if not isinstance(raw_entries, list) or len(raw_entries) > self._max_tree_entries:
            raise GitHubReadError("GITHUB_TREE_ENTRY_LIMIT_OR_SHAPE_INVALID")

        entries: list[GitTreeEntry] = []
        by_path: dict[str, GitTreeEntry] = {}
        folded: set[str] = set()
        for raw in raw_entries:
            if not isinstance(raw, dict):
                raise GitHubReadError("GITHUB_TREE_ENTRY_INVALID")
            path, mode, kind, sha = (raw.get("path"), raw.get("mode"), raw.get("type"), raw.get("sha"))
            if not all(isinstance(v, str) and v for v in (path, mode, kind, sha)):
                raise GitHubReadError("GITHUB_TREE_ENTRY_FIELD_INVALID")
            if not _SHA1_RE.fullmatch(sha):
                raise GitHubReadError("GITHUB_TREE_ENTRY_SHA_INVALID")
            key = path.casefold()
            if key in folded:
                raise GitHubReadError("GITHUB_TREE_DUPLICATE_OR_CASE_COLLISION")
            folded.add(key)
            entry = GitTreeEntry(path=path, mode=mode, object_type=kind, sha=sha)
            entries.append(entry)
            by_path[path] = entry

        base_blobs: dict[str, bytes] = {}
        total_bytes = 0
        for path in paths:
            entry = by_path.get(path)
            if entry is None:
                continue
            # Only regular blobs are retrievable for this patch boundary.
            if entry.mode not in {"100644", "100755"} or entry.object_type != "blob":
                # Preserve the unsafe tree entry for the pure verifier to reject.
                continue
            blob_url = f"{self._api}/repos/{self._repository}/git/blobs/{entry.sha}"
            blob_payload = self._get_object(blob_url, "GITHUB_BLOB_RESPONSE_INVALID")
            if blob_payload.get("sha") != entry.sha:
                raise GitHubReadError("GITHUB_BLOB_SHA_FIELD_MISMATCH")
            if blob_payload.get("encoding") != "base64" or not isinstance(blob_payload.get("content"), str):
                raise GitHubReadError("GITHUB_BLOB_ENCODING_UNSUPPORTED")
            encoded = "".join(blob_payload["content"].split())
            try:
                raw_bytes = base64.b64decode(encoded, validate=True)
            except (binascii.Error, ValueError) as exc:
                raise GitHubReadError("GITHUB_BLOB_BASE64_INVALID") from exc
            if len(raw_bytes) > self._max_blob_bytes:
                raise GitHubReadError("GITHUB_BLOB_SIZE_LIMIT_EXCEEDED")
            total_bytes += len(raw_bytes)
            if total_bytes > self._max_total_blob_bytes:
                raise GitHubReadError("GITHUB_TOTAL_BLOB_SIZE_LIMIT_EXCEEDED")
            if git_blob_sha1(raw_bytes) != entry.sha:
                raise GitHubReadError("GITHUB_BLOB_OBJECT_HASH_MISMATCH")
            base_blobs[path] = raw_bytes

        return RetrievedGitSnapshot(
            commit_sha=base_commit_sha,
            tree_sha=tree_sha,
            tree_entries=tuple(entries),
            base_blob_contents=dict(base_blobs),
        )

    def retrieve_and_verify(
        self,
        *,
        manifest: PatchManifest,
        intent: ApprovalApplyIntent,
        proposed_blob_contents: Mapping[str, bytes],
        policy: PatchPolicy | None = None,
    ) -> GitObjectVerificationReport:
        if not isinstance(manifest, PatchManifest):
            raise TypeError("PATCH_MANIFEST_REQUIRED")
        if not isinstance(intent, ApprovalApplyIntent):
            raise TypeError("PERSISTED_APPROVAL_INTENT_REQUIRED")
        if manifest.repository_id != self._repository_id:
            raise GitHubReadError("GITHUB_REPOSITORY_SCOPE_MISMATCH")
        if manifest.base_commit_sha != intent.base_commit_sha:
            raise GitHubReadError("GITHUB_APPROVAL_BASE_COMMIT_MISMATCH")

        snapshot = self.retrieve_snapshot(
            base_commit_sha=manifest.base_commit_sha,
            paths=tuple(item.path for item in manifest.files),
        )
        return verify_git_snapshot(
            manifest=manifest,
            intent=intent,
            tree_entries=snapshot.tree_entries,
            base_blob_contents=snapshot.base_blob_contents,
            proposed_blob_contents=proposed_blob_contents,
            tree_truncated=False,
            policy=policy,
        )

    def _get_object(self, url: str, error_code: str) -> Mapping[str, object]:
        payload = self._transport.get_json(url)
        if not isinstance(payload, Mapping):
            raise GitHubReadError(error_code)
        return payload
