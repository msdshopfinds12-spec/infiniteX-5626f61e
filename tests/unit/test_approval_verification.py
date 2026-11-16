from types import SimpleNamespace

import pytest

import backend.app.auth.approval_verification as adapter
from backend.app.auth.approval_reviewer import ApprovalReviewerContext
from backend.app.auth.approval_verification import (
    ApprovalVerificationScope,
    verify_for_authenticated_reviewer,
)

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
    now=1_900_000_000,
)


def test_adapter_uses_authenticated_reviewer_and_trusted_scope(monkeypatch):
    captured = {}

    def fake_verify(payload, signature, public_key, **kwargs):
        captured.update(kwargs)
        return SimpleNamespace(jti="one-time-approval")

    monkeypatch.setattr(adapter, "verify_ed25519_approval", fake_verify)

    result = verify_for_authenticated_reviewer(
        reviewer=REVIEWER,
        payload={"sub": "untrusted-payload-subject"},
        signature=b"signed",
        public_key=object(),
        scope=SCOPE,
    )

    assert result.jti == "one-time-approval"
    assert captured["expected_reviewer_subject"] == "authenticated-owner"
    assert captured["expected_reviewer_role"] == "owner"
    assert captured["expected_repository_id"] == "123456"
    assert captured["expected_branch"] == "fix/infiniteX-foundation-hardening"
    assert captured["expected_file_paths"] == ("backend/app/example.py",)


def test_adapter_rejects_forged_reviewer_context():
    with pytest.raises(TypeError, match="server-derived reviewer context"):
        verify_for_authenticated_reviewer(
            reviewer={"subject": "attacker", "role": "owner"},
            payload={},
            signature=b"",
            public_key=object(),
            scope=SCOPE,
        )


def test_adapter_rejects_untrusted_scope_object():
    with pytest.raises(TypeError, match="trusted server-side proposal scope"):
        verify_for_authenticated_reviewer(
            reviewer=REVIEWER,
            payload={},
            signature=b"",
            public_key=object(),
            scope={"repository_id": "attacker-controlled"},
        )
