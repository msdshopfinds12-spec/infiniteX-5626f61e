"""Atomic, tenant-scoped usage reservation primitives.

Callers own the SQLAlchemy transaction and must commit/rollback. Tenant identity
and limits must come from verified server-side authentication and entitlements.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database.models.usage import UsageBucket, UsageReservation


class UsageError(Exception):
    """Base error for usage accounting."""


class UsageLimitExceeded(UsageError):
    """The requested amount would exceed the configured allowance."""


class IdempotencyConflict(UsageError):
    """An idempotency key was reused for a different operation."""


class ReservationStateError(UsageError):
    """A reservation cannot transition from its current state."""


@dataclass(frozen=True, slots=True)
class ReservationResult:
    reservation: UsageReservation
    replayed: bool


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _digest(*, metric: str, amount: int, period_start: datetime,
            period_end: datetime, limit_amount: int) -> str:
    payload = {
        "metric": metric, "amount": amount,
        "period_start": _utc(period_start).isoformat(),
        "period_end": _utc(period_end).isoformat(), "limit_amount": limit_amount,
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def _ensure_bucket(session: Session, *, bucket_id: str, tenant_id: str,
                   metric: str, period_start: datetime, period_end: datetime,
                   limit_amount: int) -> UsageBucket:
    values = {
        "bucket_id": bucket_id, "tenant_id": tenant_id, "metric": metric,
        "period_start": period_start, "period_end": period_end,
        "limit_amount": limit_amount, "used_amount": 0, "reserved_amount": 0,
    }
    dialect = session.get_bind().dialect.name
    if dialect == "sqlite":
        from sqlalchemy.dialects.sqlite import insert
        statement = insert(UsageBucket).values(**values).on_conflict_do_nothing(
            index_elements=["tenant_id", "metric", "period_start"]
        )
    elif dialect == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
        statement = insert(UsageBucket).values(**values).on_conflict_do_nothing(
            constraint="uq_usage_bucket_tenant_metric_period"
        )
    else:
        raise UsageError(f"Unsupported database dialect for atomic quota accounting: {dialect}")
    session.execute(statement)
    bucket = session.scalar(select(UsageBucket).where(
        UsageBucket.tenant_id == tenant_id,
        UsageBucket.metric == metric,
        UsageBucket.period_start == period_start,
    ))
    if bucket is None:
        raise UsageError("Usage bucket could not be initialized")
    if _utc(bucket.period_end) != _utc(period_end) or bucket.limit_amount != limit_amount:
        raise UsageError("Usage policy changed within an existing accounting period")
    return bucket


def reserve_usage(
    session: Session, *, tenant_id: str, metric: str, amount: int,
    idempotency_key: str, period_start: datetime, period_end: datetime,
    limit_amount: int, ttl: timedelta = timedelta(minutes=15),
    now: datetime | None = None,
) -> ReservationResult:
    """Atomically reserve quota; caller must commit/rollback the transaction."""
    now = _utc(now or datetime.now(timezone.utc))
    if not tenant_id or not metric or not idempotency_key:
        raise ValueError("tenant_id, metric and idempotency_key are required")
    if len(idempotency_key) > 128 or amount <= 0 or limit_amount < 0:
        raise ValueError("Invalid idempotency key, amount, or limit")
    if period_start >= period_end or not _utc(period_start) <= now < _utc(period_end):
        raise ValueError("Accounting period must contain the current time")
    if ttl.total_seconds() <= 0:
        raise ValueError("Reservation TTL must be positive")

    digest = _digest(metric=metric, amount=amount, period_start=period_start,
                     period_end=period_end, limit_amount=limit_amount)
    existing = session.scalar(select(UsageReservation).where(
        UsageReservation.tenant_id == tenant_id,
        UsageReservation.idempotency_key == idempotency_key,
    ))
    if existing is not None:
        if existing.request_digest != digest:
            raise IdempotencyConflict("Idempotency key was reused for a different request")
        if existing.status == "expired" or (
            existing.status == "reserved" and _utc(existing.expires_at) <= now
        ):
            raise ReservationStateError("This reservation has expired; use a new idempotency key")
        return ReservationResult(existing, True)

    bucket = _ensure_bucket(
        session, bucket_id=str(uuid4()), tenant_id=tenant_id, metric=metric,
        period_start=period_start, period_end=period_end, limit_amount=limit_amount,
    )
    reservation = UsageReservation(
        reservation_id=str(uuid4()), bucket_id=bucket.bucket_id,
        tenant_id=tenant_id, metric=metric, idempotency_key=idempotency_key,
        request_digest=digest, amount=amount, status="reserved",
        created_at=now, expires_at=now + ttl,
    )
    try:
        with session.begin_nested():
            session.add(reservation)
            session.flush()
            result = session.execute(
                update(UsageBucket)
                .where(
                    UsageBucket.bucket_id == bucket.bucket_id,
                    UsageBucket.tenant_id == tenant_id,
                    UsageBucket.used_amount + UsageBucket.reserved_amount + amount
                    <= UsageBucket.limit_amount,
                )
                .values(reserved_amount=UsageBucket.reserved_amount + amount)
            )
            if result.rowcount != 1:
                raise UsageLimitExceeded("Usage allowance exceeded")
    except IntegrityError:
        existing = session.scalar(select(UsageReservation).where(
            UsageReservation.tenant_id == tenant_id,
            UsageReservation.idempotency_key == idempotency_key,
        ))
        if existing is None:
            raise
        if existing.request_digest != digest:
            raise IdempotencyConflict("Idempotency key was reused for a different request")
        return ReservationResult(existing, True)
    return ReservationResult(reservation, False)


def _transition(session: Session, *, tenant_id: str, reservation_id: str,
                target: str, now: datetime | None = None) -> UsageReservation:
    now = _utc(now or datetime.now(timezone.utc))
    reservation = session.scalar(select(UsageReservation).where(
        UsageReservation.reservation_id == reservation_id,
        UsageReservation.tenant_id == tenant_id,
    ))
    if reservation is None:
        raise ReservationStateError("Reservation not found for this tenant")
    if reservation.status != "reserved":
        raise ReservationStateError(f"Reservation is already {reservation.status}")
    if _utc(reservation.expires_at) <= now:
        raise ReservationStateError("Reservation has expired")
    bucket_update = update(UsageBucket).where(
        UsageBucket.bucket_id == reservation.bucket_id,
        UsageBucket.tenant_id == tenant_id,
        UsageBucket.reserved_amount >= reservation.amount,
    )
    if target == "committed":
        bucket_update = bucket_update.values(
            reserved_amount=UsageBucket.reserved_amount - reservation.amount,
            used_amount=UsageBucket.used_amount + reservation.amount,
        )
    else:
        bucket_update = bucket_update.values(
            reserved_amount=UsageBucket.reserved_amount - reservation.amount
        )
    result = session.execute(bucket_update)
    if result.rowcount != 1:
        raise UsageError("Usage bucket invariant violated; roll back the transaction")
    changed = session.execute(
        update(UsageReservation)
        .where(
            UsageReservation.reservation_id == reservation_id,
            UsageReservation.tenant_id == tenant_id,
            UsageReservation.status == "reserved",
        )
        .values(status=target, completed_at=now)
    )
    if changed.rowcount != 1:
        raise ReservationStateError("Concurrent transition detected; roll back the transaction")
    session.flush()
    session.refresh(reservation)
    return reservation


def commit_usage(session: Session, *, tenant_id: str, reservation_id: str,
                 now: datetime | None = None) -> UsageReservation:
    """Convert reserved units into consumed units inside the caller transaction."""
    return _transition(session, tenant_id=tenant_id, reservation_id=reservation_id,
                       target="committed", now=now)


def release_usage(session: Session, *, tenant_id: str, reservation_id: str,
                  now: datetime | None = None) -> UsageReservation:
    """Release reserved units after a failed/cancelled operation."""
    return _transition(session, tenant_id=tenant_id, reservation_id=reservation_id,
                       target="released", now=now)
