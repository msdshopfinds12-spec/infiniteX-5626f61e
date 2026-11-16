"""Shared PostgreSQL transaction-local tenant context.

This is defense-in-depth, not an authentication boundary: callers must derive
tenant_id from a verified server-side principal and repositories must retain
explicit tenant predicates. PostgreSQL RLS policies consume this transaction-
local setting; SQLite deliberately remains a no-op for unit tests.
"""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session


def set_tenant_context(session: Session, tenant_id: str) -> None:
    """Set the authorized tenant for the current transaction on PostgreSQL.

    The third argument to set_config makes the setting transaction-local, so it
    is cleared automatically at commit/rollback and cannot leak through a
    pooled connection into a later transaction.
    """
    if not isinstance(tenant_id, str) or not tenant_id.strip():
        raise ValueError("Tenant identity is required")

    if session.get_bind().dialect.name != "postgresql":
        return

    try:
        normalized_tenant_id = str(UUID(tenant_id))
    except (TypeError, ValueError, AttributeError) as exc:
        raise ValueError("PostgreSQL tenant identity must be a valid UUID") from exc

    session.execute(
        text("SELECT set_config('app.tenant_id', :tenant_id, true)"),
        {"tenant_id": normalized_tenant_id},
    )
