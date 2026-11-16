"""Trusted reviewer context derived only from backend authentication.

This application currently supports one configured owner, not a general reviewer
directory. The dependency therefore grants only the owner role and never reads a
role, subject, or tenant identifier from request data.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends

from backend.app.auth.dependencies import CurrentPrincipal, get_current_principal


@dataclass(frozen=True)
class ApprovalReviewerContext:
    """Server-derived identity and role allowed to review approval evidence."""

    subject: str
    role: str
    tenant_id: str


def get_approval_reviewer(
    principal: Annotated[CurrentPrincipal, Depends(get_current_principal)],
) -> ApprovalReviewerContext:
    """Map the already-authenticated single owner to the sole reviewer role.

    Multi-reviewer roles must not be added here until a server-side role directory
    and authorization policy are implemented and independently tested.
    """
    if not isinstance(principal, CurrentPrincipal):
        raise TypeError("approval reviewer requires an authenticated principal")
    if not principal.subject or not principal.tenant_id:
        raise ValueError("authenticated reviewer context is incomplete")
    return ApprovalReviewerContext(
        subject=principal.subject,
        role="owner",
        tenant_id=principal.tenant_id,
    )
