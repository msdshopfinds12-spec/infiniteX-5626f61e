from __future__ import annotations

from copy import deepcopy

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from iq_core.agents.approval_contract import (
    ApprovalClaims,
    ApprovalRejected,
    canonical_approval_bytes,
    verify_ed25519_approval,
)


@pytest.fixture
def signed_approval():
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()
    payload = {
        "iss": "infiniteX-local-approval",
        "aud": "infiniteX-apply",
        "jti": "test-one-time-nonce-000000000001",
        "sub": "reviewer-test-1",
        "reviewer_role": "owner",
        "repository_id": "1426264287",
        "target_branch": "fix/infiniteX-foundation-hardening",
        "base_commit_sha": "a" * 40,
        "proposal_id": "proposal-test-1",
        "proposal_sha256": "b" * 64,
        "file_paths": ["src/app.py"],
        "policy_version": "1.0",
        "schema_version": 1,
        "iat": 1_000,
        "nbf": 1_000,
        "exp": 1_300,
    }
    claims = ApprovalClaims.from_payload(payload)
    signature = private_key.sign(canonical_approval_bytes(claims))
    expected = {
        "expected_issuer": payload["iss"],
        "expected_audience": payload["aud"],
        "expected_repository_id": payload["repository_id"],
        "expected_branch": payload["target_branch"],
        "expected_base_commit_sha": payload["base_commit_sha"],
        "expected_proposal_id": payload["proposal_id"],
        "expected_proposal_sha256": payload["proposal_sha256"],
        "expected_file_paths": ("src/app.py",),
        "now": 1_100,
    }
    return payload, signature, public_key, expected


def verify(payload, signature, public_key, expected):
    return verify_ed25519_approval(
        payload, signature, public_key, **expected
    )


def test_accepts_exact_signed_approval(signed_approval):
    payload, signature, public_key, expected = signed_approval
    claims = verify(payload, signature, public_key, expected)
    assert claims.proposal_id == "proposal-test-1"
    assert claims.file_paths == ("src/app.py",)


def test_rejects_tampered_signature(signed_approval):
    payload, signature, public_key, expected = signed_approval
    tampered = bytes([signature[0] ^ 1]) + signature[1:]
    with pytest.raises(ApprovalRejected, match="SIGNATURE_INVALID"):
        verify(payload, tampered, public_key, expected)


def test_rejects_wrong_base_commit(signed_approval):
    payload, signature, public_key, expected = signed_approval
    wrong_scope = {**expected, "expected_base_commit_sha": "c" * 40}
    with pytest.raises(ApprovalRejected, match="BASE_COMMIT_MISMATCH"):
        verify(payload, signature, public_key, wrong_scope)


def test_rejects_expired_approval(signed_approval):
    payload, signature, public_key, expected = signed_approval
    expired = {**expected, "now": 1_300}
    with pytest.raises(ApprovalRejected, match="APPROVAL_EXPIRED"):
        verify(payload, signature, public_key, expired)


def test_rejects_path_traversal(signed_approval):
    payload, _, _, _ = signed_approval
    unsafe = deepcopy(payload)
    unsafe["file_paths"] = ["../secrets.env"]
    with pytest.raises(ApprovalRejected, match="FILE_PATH_UNSAFE"):
        ApprovalClaims.from_payload(unsafe)


def test_rejects_noncanonical_file_list(signed_approval):
    payload, _, _, _ = signed_approval
    duplicate = deepcopy(payload)
    duplicate["file_paths"] = ["src/app.py", "src/app.py"]
    with pytest.raises(ApprovalRejected, match="FILE_SET_NOT_CANONICAL"):
        ApprovalClaims.from_payload(duplicate)


def test_rejects_lifetime_over_fifteen_minutes(signed_approval):
    payload, _, _, _ = signed_approval
    long_lived = deepcopy(payload)
    long_lived["exp"] = long_lived["iat"] + 901
    with pytest.raises(ApprovalRejected, match="APPROVAL_TTL_EXCEEDED"):
        ApprovalClaims.from_payload(long_lived)


def test_rejects_unknown_claims(signed_approval):
    payload, _, _, _ = signed_approval
    extended = {**payload, "admin": True}
    with pytest.raises(ApprovalRejected, match="CLAIM_SET_INVALID"):
        ApprovalClaims.from_payload(extended)
