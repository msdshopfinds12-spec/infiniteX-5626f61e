"""Deterministic task idempotency without requiring a schema migration."""
from __future__ import annotations

import re
from uuid import NAMESPACE_URL, uuid5
from typing import Any

from database.models.task import TaskRecord

_KEY_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")


def task_id_for_idempotency_key(tenant_id: str, key: str) -> str:
    """Derive a stable, tenant-scoped task ID from a bounded client idempotency key."""
    if not isinstance(key, str) or not _KEY_PATTERN.fullmatch(key):
        raise ValueError("Idempotency-Key must be 1-128 safe ASCII characters")
    if not tenant_id:
        raise ValueError("Tenant identity is required")
    return str(uuid5(NAMESPACE_URL, f"infinitegx:task:{tenant_id}:{key}"))


def task_record_matches_request(
    record: TaskRecord,
    *,
    name: str,
    objective: str,
    input_data: dict[str, Any],
) -> bool:
    """Prevent reusing one idempotency key for a different request body."""
    return (
        record.name == name
        and record.objective == objective
        and record.input_data == input_data
    )
