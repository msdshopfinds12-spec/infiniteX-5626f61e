"""Fail-closed loading of the trusted approval public-key ring."""
from __future__ import annotations

from backend.app.auth.approval_keyring import (
    ApprovalKeyringConfigurationError,
    TrustedApprovalKeyring,
)
from backend.app.config import Settings


def load_approval_keyring(settings: Settings) -> TrustedApprovalKeyring:
    """Load only configured public keys; never fall back to caller-supplied keys."""
    if not isinstance(settings, Settings):
        raise TypeError("trusted backend Settings are required")
    raw = settings.approval_public_keys_json
    if not raw:
        raise ApprovalKeyringConfigurationError(
            "INFINITEGX_APPROVAL_PUBLIC_KEYS_JSON is not configured"
        )
    return TrustedApprovalKeyring.from_json(raw)
