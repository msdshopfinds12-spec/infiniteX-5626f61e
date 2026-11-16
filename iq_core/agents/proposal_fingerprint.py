"""Stable SHA-256 fingerprints for exact code-change proposals.

A fingerprint binds approval evidence to proposal content. It is not an
authentication mechanism and does not itself authorize applying a patch.
"""
from __future__ import annotations

import hashlib
import json

from iq_core.agents.code_change_policy import CodeChangeProposal, ProposedFileChange


FINGERPRINT_SCHEMA_VERSION = 1
CODE_CHANGE_POLICY_VERSION = "1.0"


def proposal_fingerprint(proposal: CodeChangeProposal) -> str:
    """Return a deterministic digest for a structurally valid proposal."""
    if not isinstance(proposal, CodeChangeProposal):
        raise TypeError("proposal must be a CodeChangeProposal")
    if not isinstance(proposal.target_branch, str) or not proposal.target_branch.strip():
        raise ValueError("proposal target_branch must be a non-empty string")
    if not isinstance(proposal.proposal_id, str) or not proposal.proposal_id.strip():
        raise ValueError("proposal proposal_id must be a non-empty string")
    if not isinstance(proposal.rationale, str) or not proposal.rationale.strip():
        raise ValueError("proposal rationale must be a non-empty string")
    if not isinstance(proposal.changes, tuple) or not proposal.changes:
        raise ValueError("proposal changes must be a non-empty tuple")

    normalized_changes: list[dict[str, str]] = []
    seen: set[str] = set()
    for change in proposal.changes:
        if not isinstance(change, ProposedFileChange):
            raise TypeError("every proposal change must be a ProposedFileChange")
        if not isinstance(change.path, str) or not change.path.strip():
            raise ValueError("every change path must be a non-empty string")
        if not isinstance(change.content, str):
            raise TypeError("every change content must be text")
        if change.path in seen:
            raise ValueError("proposal contains duplicate paths")
        seen.add(change.path)
        normalized_changes.append({"path": change.path, "content": change.content})

    # Sorting makes the digest independent of input ordering, while retaining
    # exact path/content bytes and all approval-relevant proposal metadata.
    normalized_changes.sort(key=lambda item: item["path"])
    canonical = {
        "fingerprint_schema_version": FINGERPRINT_SCHEMA_VERSION,
        "policy_version": CODE_CHANGE_POLICY_VERSION,
        "proposal_id": proposal.proposal_id.strip(),
        "target_branch": proposal.target_branch.strip(),
        "rationale": proposal.rationale.strip(),
        "changes": normalized_changes,
    }
    encoded = json.dumps(
        canonical,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()
