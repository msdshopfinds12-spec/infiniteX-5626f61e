"""Tenant-scoped usage buckets and idempotent reservations."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    BigInteger, CheckConstraint, DateTime, Index, Integer, String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from database.models.base import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class UsageBucket(Base):
    __tablename__ = "usage_buckets"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "metric", "period_start", name="uq_usage_bucket_tenant_metric_period"
        ),
        CheckConstraint("limit_amount >= 0", name="ck_usage_bucket_limit_nonnegative"),
        CheckConstraint("used_amount >= 0", name="ck_usage_bucket_used_nonnegative"),
        CheckConstraint("reserved_amount >= 0", name="ck_usage_bucket_reserved_nonnegative"),
        Index("ix_usage_buckets_tenant_period", "tenant_id", "period_start", "period_end"),
    )

    bucket_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False)
    metric: Mapped[str] = mapped_column(String(100), nullable=False)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    limit_amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    used_amount: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    reserved_amount: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )


class UsageReservation(Base):
    __tablename__ = "usage_reservations"
    __table_args__ = (
        UniqueConstraint("tenant_id", "idempotency_key", name="uq_usage_reservation_tenant_key"),
        CheckConstraint("amount > 0", name="ck_usage_reservation_amount_positive"),
        Index("ix_usage_reservations_tenant_status_expiry", "tenant_id", "status", "expires_at"),
        Index("ix_usage_reservations_bucket", "bucket_id", "status"),
    )

    reservation_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    bucket_id: Mapped[str] = mapped_column(String(36), nullable=False)
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False)
    metric: Mapped[str] = mapped_column(String(100), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    request_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="reserved")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
