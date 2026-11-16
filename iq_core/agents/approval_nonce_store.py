"""Persistence boundary for one-time approval nonce consumption.

A production adapter must implement consume_once as one atomic durable operation
backed by a unique constraint. This repository intentionally provides no
process-local fallback because it would not prevent replay across restarts or
multiple workers.
"""
from __future__ import annotations

from typing import Protocol

from iq_core.agents.approval_contract import ApprovalClaims


class ApprovalNonceStore(Protocol):
    """Durable, atomic one-time nonce store required by the apply service."""

    def consume_once(self, *, jti: str, expires_at: int) -> bool:
        """Return True exactly once; return False for any previously consumed jti.

        Implementations must persist the nonce and enforce uniqueness atomically.
        Expired nonce cleanup must not permit a still-valid token to be replayed.
        """
        ...


def consume_verified_approval(
    claims: ApprovalClaims,
    store: ApprovalNonceStore,
) -> bool:
    """Consume a previously verified approval exactly once.

    Call only after cryptographic and scope verification. The caller must perform
    nonce consumption in the same database transaction as creating the immutable
    apply-intent record. A True result alone does not authorize applying code.
    """
    return store.consume_once(jti=claims.jti, expires_at=claims.exp)
