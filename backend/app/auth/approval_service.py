"""Internal approval verification orchestration; deliberately not an HTTP route.

The service composes strict transport validation, server-configured public-key
resolution, authenticated reviewer identity, trusted proposal scope, and the
existing Ed25519 verifier. It never consumes a nonce or applies a patch.
"""
from __future__ import annotations

from backend.app.auth.approval_keyring import TrustedApprovalKeyring
from backend.app.auth.approval_reviewer import ApprovalReviewerContext
from backend.app.auth.approval_verification import (
    ApprovalVerificationScope,
    verify_for_authenticated_reviewer,
)
from backend.app.schemas.approval import ApprovalVerificationRequest
from iq_core.agents.approval_contract import ApprovalClaims


def verify_approval_request(
    *,
    request: ApprovalVerificationRequest,
    keyring: TrustedApprovalKeyring,
    reviewer: ApprovalReviewerContext,
    scope: ApprovalVerificationScope,
) -> ApprovalClaims:
    """Verify one request against trusted server-side identity and proposal state.

    The request payload is untrusted. Reviewer and scope values must be produced
    by authenticated dependencies and a trusted proposal repository, never by
    copying claims out of the request body.
    """
    if not isinstance(request, ApprovalVerificationRequest):
        raise TypeError("request must be a validated ApprovalVerificationRequest")
    if not isinstance(keyring, TrustedApprovalKeyring):
        raise TypeError("keyring must be a TrustedApprovalKeyring")
    public_key = keyring.resolve(request.key_id)
    return verify_for_authenticated_reviewer(
        reviewer=reviewer,
        payload=request.payload,
        signature=request.signature_bytes(),
        public_key=public_key,
        scope=scope,
    )
