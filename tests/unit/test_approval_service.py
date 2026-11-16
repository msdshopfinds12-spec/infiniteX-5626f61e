import base64
import json

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from backend.app.auth.approval_keyring import TrustedApprovalKeyring, UnknownApprovalKey
from backend.app.auth.approval_reviewer import ApprovalReviewerContext
from backend.app.auth.approval_service import verify_approval_request
from backend.app.auth.approval_verification import ApprovalVerificationScope
from backend.app.schemas.approval import ApprovalVerificationRequest
from iq_core.agents.approval_contract import ApprovalClaims, canonical_approval_bytes


NOW = 1_900_000_100
REVIEWER = ApprovalReviewerContext(
    subject="authenticated-owner",
    role="owner",
    tenant_id="11111111-1111-4111-8111-111111111111",
)
SCOPE = ApprovalVerificationScope(
    issuer="approval-service",
    audience="infinitegx-approval",
    repository_id="123456",
    target_branch="fix/infiniteX-foundation-hardening",
    base_commit_sha="a" * 40,
    proposal_id="proposal-123",
    proposal_sha256="b" * 64,
    policy_version="policy-v1",
    file_paths=("backend/app/example.py",),
    now=NOW,
)


def make_claims(**overrides):
    values = {
        "iss": "approval-service",
        "aud": "infinitegx-approval",
        "jti": "nonce-123",
        "sub": "authenticated-owner",
        "reviewer_role": "owner",
        "repository_id": "123456",
        "target_branch": "fix/infiniteX-foundation-hardening",
        "base_commit_sha": "a" * 40,
        "proposal_id": "proposal-123",
        "proposal_sha256": "b" * 64,
        "file_paths": ("backend/app/example.py",),
        "policy_version": "policy-v1",
        "schema_version": 1,
        "iat": NOW - 10,
        "nbf": NOW - 10,
        "exp": NOW + 120,
    }
    values.update(overrides)
    return ApprovalClaims(**values)


def public_bytes(private_key):
    return private_key.public_key().public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw
    )


def make_request(private_key, claims, key_id="active-2026"):
    payload = {
        **claims.__dict__,
        "file_paths": list(claims.file_paths),
    }
    signature = private_key.sign(canonical_approval_bytes(claims))
    return ApprovalVerificationRequest(
        key_id=key_id,
        payload=payload,
        signature_b64=base64.b64encode(signature).decode("ascii"),
    )


def test_service_verifies_signature_and_trusted_scope():
    private_key = Ed25519PrivateKey.generate()
    ring = TrustedApprovalKeyring({"active-2026": public_bytes(private_key)})
    claims = make_claims()
    request = make_request(private_key, claims)

    verified = verify_approval_request(
        request=request, keyring=ring, reviewer=REVIEWER, scope=SCOPE
    )

    assert verified == claims


def test_service_rejects_unknown_or_retired_key_id():
    private_key = Ed25519PrivateKey.generate()
    ring = TrustedApprovalKeyring({"active-2026": public_bytes(private_key)})
    request = make_request(private_key, make_claims(), key_id="retired-2025")

    with pytest.raises(UnknownApprovalKey):
        verify_approval_request(
            request=request, keyring=ring, reviewer=REVIEWER, scope=SCOPE
        )


def test_service_rejects_signature_from_different_key():
    trusted_key = Ed25519PrivateKey.generate()
    attacker_key = Ed25519PrivateKey.generate()
    ring = TrustedApprovalKeyring({"active-2026": public_bytes(trusted_key)})
    request = make_request(attacker_key, make_claims())

    with pytest.raises(ValueError, match="SIGNATURE_INVALID"):
        verify_approval_request(
            request=request, keyring=ring, reviewer=REVIEWER, scope=SCOPE
        )


def test_service_rejects_reviewer_mismatch_even_with_valid_signature():
    private_key = Ed25519PrivateKey.generate()
    ring = TrustedApprovalKeyring({"active-2026": public_bytes(private_key)})
    claims = make_claims(sub="different-reviewer")
    request = make_request(private_key, claims)

    with pytest.raises(ValueError, match="REVIEWER_SUBJECT_MISMATCH"):
        verify_approval_request(
            request=request, keyring=ring, reviewer=REVIEWER, scope=SCOPE
        )


def test_service_rejects_proposal_scope_mismatch_even_with_valid_signature():
    private_key = Ed25519PrivateKey.generate()
    ring = TrustedApprovalKeyring({"active-2026": public_bytes(private_key)})
    claims = make_claims(target_branch="main")
    request = make_request(private_key, claims)

    with pytest.raises(ValueError, match="BRANCH_MISMATCH"):
        verify_approval_request(
            request=request, keyring=ring, reviewer=REVIEWER, scope=SCOPE
        )


def test_service_rejects_unvalidated_request_objects():
    private_key = Ed25519PrivateKey.generate()
    ring = TrustedApprovalKeyring({"active-2026": public_bytes(private_key)})

    with pytest.raises(TypeError, match="validated ApprovalVerificationRequest"):
        verify_approval_request(
            request={"payload": {}}, keyring=ring, reviewer=REVIEWER, scope=SCOPE
        )
