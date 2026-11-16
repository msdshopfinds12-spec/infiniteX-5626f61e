"""Human-gated policy for proposed self-modifying code changes.

This module validates proposals only. It never writes files, creates commits,
executes generated code, or grants approval to apply a change.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import PurePosixPath


@dataclass(frozen=True)
class ProposedFileChange:
    path: str
    content: str


@dataclass(frozen=True)
class CodeChangeProposal:
    target_branch: str
    changes: tuple[ProposedFileChange, ...]
    rationale: str
    proposal_id: str


@dataclass(frozen=True)
class CodeChangeDecision:
    status: str
    reason_codes: tuple[str, ...]
    file_count: int
    total_bytes: int


class CodeChangePolicy:
    """Fail-closed proposal validator; valid proposals still require human review."""

    MAX_FILES = 20
    MAX_FILE_BYTES = 200_000
    MAX_TOTAL_BYTES = 1_000_000
    ALLOWED_BRANCH_PREFIXES = ("fix/", "feat/", "chore/")
    PROTECTED_BRANCHES = {"main", "master", "phase-9/capability-mesh"}
    PROTECTED_PATHS = {
        ".env",
        ".env.local",
        ".env.production",
        "id_rsa",
        "id_ed25519",
    }
    SECRET_PATTERNS = (
        re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
        re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b"),
        re.compile(r"\bsk-[A-Za-z0-9]{20,}\b"),
        re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
        re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b"),
    )

    def evaluate(self, proposal: CodeChangeProposal) -> CodeChangeDecision:
        reasons: list[str] = []

        if not isinstance(proposal, CodeChangeProposal):
            return CodeChangeDecision("BLOCKED", ("INVALID_PROPOSAL_TYPE",), 0, 0)

        branch = proposal.target_branch
        if not isinstance(branch, str) or not branch.strip():
            reasons.append("TARGET_BRANCH_REQUIRED")
        else:
            normalized_branch = branch.strip()
            if normalized_branch in self.PROTECTED_BRANCHES:
                reasons.append("PROTECTED_BRANCH_FORBIDDEN")
            elif not normalized_branch.startswith(self.ALLOWED_BRANCH_PREFIXES):
                reasons.append("UNAPPROVED_BRANCH_NAMESPACE")

        if not isinstance(proposal.proposal_id, str) or not proposal.proposal_id.strip():
            reasons.append("PROPOSAL_ID_REQUIRED")
        if not isinstance(proposal.rationale, str) or not proposal.rationale.strip():
            reasons.append("RATIONALE_REQUIRED")
        if not isinstance(proposal.changes, tuple) or not proposal.changes:
            reasons.append("CHANGES_REQUIRED")
            return CodeChangeDecision("BLOCKED", tuple(reasons), 0, 0)
        if len(proposal.changes) > self.MAX_FILES:
            reasons.append("TOO_MANY_FILES")

        seen_paths: set[str] = set()
        total_bytes = 0

        for change in proposal.changes:
            if not isinstance(change, ProposedFileChange):
                reasons.append("INVALID_FILE_CHANGE")
                continue
            path = change.path
            if not isinstance(path, str) or not path.strip():
                reasons.append("INVALID_FILE_PATH")
                continue
            if "\\" in path or path.startswith("/") or "\x00" in path:
                reasons.append("UNSAFE_FILE_PATH")
                continue

            normalized = str(PurePosixPath(path))
            parts = PurePosixPath(path).parts
            if normalized != path or any(part in {".", ".."} for part in parts):
                reasons.append("PATH_TRAVERSAL_FORBIDDEN")
                continue
            if normalized in seen_paths:
                reasons.append("DUPLICATE_FILE_PATH")
                continue
            seen_paths.add(normalized)

            lowered = normalized.lower()
            basename = PurePosixPath(lowered).name
            if (
                basename in self.PROTECTED_PATHS
                or basename.startswith(".env.")
                or basename.endswith((".pem", ".key", ".p12", ".pfx"))
                or "secrets" in PurePosixPath(lowered).parts
            ):
                reasons.append("SENSITIVE_FILE_PATH_FORBIDDEN")

            if not isinstance(change.content, str):
                reasons.append("FILE_CONTENT_MUST_BE_TEXT")
                continue
            encoded = change.content.encode("utf-8")
            size = len(encoded)
            total_bytes += size
            if size > self.MAX_FILE_BYTES:
                reasons.append("FILE_TOO_LARGE")
            if any(pattern.search(change.content) for pattern in self.SECRET_PATTERNS):
                reasons.append("POSSIBLE_SECRET_IN_CONTENT")

        if total_bytes > self.MAX_TOTAL_BYTES:
            reasons.append("PROPOSAL_TOO_LARGE")

        if reasons:
            return CodeChangeDecision(
                "BLOCKED", tuple(dict.fromkeys(reasons)), len(proposal.changes), total_bytes
            )

        return CodeChangeDecision(
            "REVIEW_REQUIRED",
            ("HUMAN_APPROVAL_REQUIRED", "NO_AUTOMATIC_WRITE_OR_EXECUTION"),
            len(proposal.changes),
            total_bytes,
        )
