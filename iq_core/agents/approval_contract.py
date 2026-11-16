"""Strict Ed25519 approval-claim verification contracts.

This module verifies approval evidence only. It does not authenticate reviewers,
issue signatures, persist nonces, apply patches, or execute generated code.
"""
from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
from typing import Any, Mapping

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey


_REQUIRED_FIELDS = {
    "iss", "aud", "jti", "sub", "reviewer_role", "repository_id",
    "target_branch", "base_commit_sha", "proposal_id", "proposal_sha256",
    "file_paths", "policy_version", "schema_version", "iat", "nbf", "exp",
}
_SHA_RE = re.compile(r"^[0-9a-f]{40}$")
_DIGEST_RE = re.compile(r"^[0-9a-f]{64}$")
_ALLOWED_ROLES = {"owner", "security_reviewer", "maintainer"}


class ApprovalRejected(ValueError):
    """Fail-closed approval rejection with a stable machine-readable code."""

    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


@dataclass(frozen=True)
class ApprovalClaims:
    iss: str
    aud: str
    jti: str
    sub: str
    reviewer_role: str
    repository_id: str
    target_branch: str
    base_commit_sha: str
    proposal_id: str
    proposal_sha256: str
    file_paths: tuple[str, ...]
    policy_version: str
    schema_version: int
    iat: int
    nbf: int
    exp: int

    @classmethod
    def from_payload(cls, payload: Mapping[str, Any]) -> "ApprovalClaims":
        if not isinstance(payload, Mapping) or set(payload) != _REQUIRED_FIELDS:
            raise ApprovalRejected("CLAIM_SET_INVALID")

        string_fields = (
            "iss", "aud", "jti", "sub", "reviewer_role", "repository_id",
            "target_branch", "base_commit_sha", "proposal_id",
            "proposal_sha256", "policy_version",
        )
        if any(not isinstance(payload[key], str) or not payload[key].strip()
               for key in string_fields):
            raise ApprovalRejected("CLAIM_TYPE_INVALID")

        if payload["reviewer_role"] not in _ALLOWED_ROLES:
            raise ApprovalRejected("REVIEWER_ROLE_INVALID")
        if not _SHA_RE.fullmatch(payload["base_commit_sha"]):
            raise ApprovalRejected("BASE_COMMIT_INVALID")
        if not _DIGEST_RE.fullmatch(payload["proposal_sha256"]):
            raise ApprovalRejected("PROPOSAL_DIGEST_INVALID")

        paths = payload["file_paths"]
        if not isinstance(paths, list) or not paths:
            raise ApprovalRejected("FILE_SET_INVALID")
        if any(not isinstance(path, str) or not path for path in paths):
            raise ApprovalRejected("FILE_SET_INVALID")
        if paths != sorted(set(paths)):
            raise ApprovalRejected("FILE_SET_NOT_CANONICAL")
        for path in paths:
            parts = path.split("/")
            if path.startswith("/") or "\\" in path or any(
                part in {"", ".", ".."} for part in parts
            ):
                raise ApprovalRejected("FILE_PATH_UNSAFE")

        for field in ("schema_version", "iat", "nbf", "exp"):
            if isinstance(payload[field], bool) or not isinstance(payload[field], int):
                raise ApprovalRejected("TIME_OR_SCHEMA_CLAIM_INVALID")
        if payload["schema_version"] != 1:
            raise ApprovalRejected("SCHEMA_VERSION_UNSUPPORTED")
        if payload["exp"] <= payload["iat"] or payload["nbf"] > payload["exp"]:
            raise ApprovalRejected("APPROVAL_WINDOW_INVALID")
        if payload["exp"] - payload["iat"] > 900:
            raise ApprovalRejected("APPROVAL_TTL_EXCEEDED")

        values = dict(payload)
        values["file_paths"] = tuple(paths)
        return cls(**values)


def canonical_approval_bytes(claims: ApprovalClaims) -> bytes:
    """Canonical UTF-8 bytes that the trusted issuer must sign."""
    payload = asdict(claims)
    payload["file_paths"] = list(claims.file_paths)
    return json.dumps(
        payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")


def verify_ed25519_approval(
    payload: Mapping[str, Any],
    signature: bytes,
    public_key: Ed25519PublicKey,
    *,
    expected_issuer: str,
    expected_audience: str,
    expected_repository_id: str,
    expected_branch: str,
    expected_base_commit_sha: str,
    expected_proposal_id: str,
    expected_proposal_sha256: str,
    expected_file_paths: tuple[str, ...],
    now: int,
) -> ApprovalClaims:
    """Verify signature, scope, and time bounds; never consumes the nonce."""
    claims = ApprovalClaims.from_payload(payload)
    if claims.iss != expected_issuer or claims.aud != expected_audience:
        raise ApprovalRejected("ISSUER_OR_AUDIENCE_MISMATCH")
    if claims.repository_id != expected_repository_id:
        raise ApprovalRejected("REPOSITORY_MISMATCH")
    if claims.target_branch != expected_branch:
        raise ApprovalRejected("BRANCH_MISMATCH")
    if claims.base_commit_sha != expected_base_commit_sha:
        raise ApprovalRejected("BASE_COMMIT_MISMATCH")
    if claims.proposal_id != expected_proposal_id:
        raise ApprovalRejected("PROPOSAL_ID_MISMATCH")
    if claims.proposal_sha256 != expected_proposal_sha256:
        raise ApprovalRejected("PROPOSAL_DIGEST_MISMATCH")
    if claims.file_paths != tuple(sorted(set(expected_file_paths))):
        raise ApprovalRejected("FILE_SET_MISMATCH")
    if isinstance(now, bool) or not isinstance(now, int):
        raise ApprovalRejected("VERIFICATION_TIME_INVALID")
    if claims.iat > now or claims.nbf > now:
        raise ApprovalRejected("APPROVAL_NOT_YET_VALID")
    if claims.exp <= now:
        raise ApprovalRejected("APPROVAL_EXPIRED")
    if not isinstance(signature, bytes) or len(signature) != 64:
        raise ApprovalRejected("SIGNATURE_FORMAT_INVALID")
    try:
        public_key.verify(signature, canonical_approval_bytes(claims))
    except InvalidSignature as exc:
        raise ApprovalRejected("SIGNATURE_INVALID") from exc
    return claims
