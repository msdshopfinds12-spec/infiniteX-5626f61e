from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from database.models.base import Base
from database.models.usage import UsageBucket
from database.usage_metering import (
    IdempotencyConflict, ReservationStateError, UsageLimitExceeded,
    commit_usage, release_usage, reserve_usage,
)

TENANT = "11111111-1111-4111-8111-111111111111"


@pytest.fixture
def session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        yield db
        db.rollback()
    engine.dispose()


@pytest.fixture
def period():
    now = datetime.now(timezone.utc)
    start = now - timedelta(minutes=1)
    end = now + timedelta(days=1)
    return now, start, end


def reserve(session, period, *, key="req-1", amount=3, limit=10, tenant=TENANT):
    now, start, end = period
    return reserve_usage(
        session, tenant_id=tenant, metric="tokens", amount=amount,
        idempotency_key=key, period_start=start, period_end=end,
        limit_amount=limit, now=now,
    )


def test_reserve_commit_updates_usage_atomically(session, period):
    result = reserve(session, period)
    assert result.replayed is False
    committed = commit_usage(
        session, tenant_id=TENANT, reservation_id=result.reservation.reservation_id,
        now=period[0],
    )
    bucket = session.scalar(select(UsageBucket).where(UsageBucket.tenant_id == TENANT))
    assert committed.status == "committed"
    assert bucket.used_amount == 3
    assert bucket.reserved_amount == 0


def test_release_returns_reserved_capacity(session, period):
    result = reserve(session, period)
    released = release_usage(
        session, tenant_id=TENANT, reservation_id=result.reservation.reservation_id,
        now=period[0],
    )
    bucket = session.scalar(select(UsageBucket).where(UsageBucket.tenant_id == TENANT))
    assert released.status == "released"
    assert bucket.reserved_amount == 0
    assert bucket.used_amount == 0


def test_limit_counts_used_plus_reserved(session, period):
    reserve(session, period, amount=7)
    with pytest.raises(UsageLimitExceeded):
        reserve(session, period, key="req-2", amount=4)


def test_same_key_same_request_is_replayed(session, period):
    first = reserve(session, period)
    second = reserve(session, period)
    assert second.replayed is True
    assert second.reservation.reservation_id == first.reservation.reservation_id


def test_same_key_different_amount_is_rejected(session, period):
    reserve(session, period)
    with pytest.raises(IdempotencyConflict):
        reserve(session, period, amount=4)


def test_tenant_cannot_read_or_transition_another_tenants_reservation(session, period):
    result = reserve(session, period)
    with pytest.raises(ReservationStateError):
        commit_usage(
            session, tenant_id="22222222-2222-4222-8222-222222222222",
            reservation_id=result.reservation.reservation_id, now=period[0],
        )


def test_reservation_cannot_be_committed_twice(session, period):
    result = reserve(session, period)
    commit_usage(session, tenant_id=TENANT, reservation_id=result.reservation.reservation_id,
                 now=period[0])
    with pytest.raises(ReservationStateError):
        commit_usage(session, tenant_id=TENANT, reservation_id=result.reservation.reservation_id,
                     now=period[0])


def test_expired_reservation_cannot_be_committed(session, period):
    result = reserve(session, period)
    with pytest.raises(ReservationStateError):
        commit_usage(
            session, tenant_id=TENANT, reservation_id=result.reservation.reservation_id,
            now=period[0] + timedelta(minutes=16),
        )
