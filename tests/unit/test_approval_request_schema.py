import base64

import pytest
from pydantic import ValidationError

from backend.app.schemas.approval import ApprovalVerificationRequest


def valid_payload():
    return {
        "iss": "approval-service",
        "aud": "infinitegx-approval",
        "jti": "nonce-123",
        "sub": "reviewer-1",
        "reviewer_role": "owner",
        "repository_id": "12345",
        "target_branch": "fix/infiniteX-foundation-hardening",
        "base_commit_sha": "a" * 40,
        "proposal_id": "proposal-1",
        "proposal_sha256": "b" * 64,
        "file_paths": ["backend/app/example.py"],
        "policy_version": "policy-v1",
        "schema_version": 1,
        "iat": 1_900_000_000,
        "nbf": 1_900_000_000,
        "exp": 1_900_000_300,
    }


def test_accepts_valid_bounded_envelope():
    signature = base64.b64encode(b"s" * 64).decode("ascii")
    request = ApprovalVerificationRequest(
        key_id="2026-01",
        payload=valid_payload(),
        signature_b64=signature,
    )
    assert request.signature_bytes() == b"s" * 64


def test_rejects_unknown_fields_and_invalid_key_ids():
    signature = base64.b64encode(b"s" * 64).decode("ascii")
    with pytest.raises(ValidationError):
        ApprovalVerificationRequest(
            key_id="bad key",
            payload=valid_payload(),
            signature_b64=signature,
        )
    with pytest.raises(ValidationError):
        ApprovalVerificationRequest(
            key_id="key-1",
            payload=valid_payload(),
            signature_b64=signature,
            reviewer_role="owner",
        )


@pytest.mark.parametrize("signature", [
    "not-base64!",
    base64.b64encode(b"short").decode("ascii"),
])
def test_rejects_invalid_signature_encoding_or_length(signature):
    with pytest.raises(ValidationError):
        ApprovalVerificationRequest(
            key_id="key-1",
            payload=valid_payload(),
            signature_b64=signature,
        )


def test_rejects_oversized_payload():
    signature = base64.b64encode(b"s" * 64).decode("ascii")
    payload = valid_payload()
    payload["extra"] = "x" * 17_000
    with pytest.raises(ValidationError):
        ApprovalVerificationRequest(
            key_id="key-1",
            payload=payload,
            signature_b64=signature,
        )
