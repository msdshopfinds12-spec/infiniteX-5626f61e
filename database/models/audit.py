"""Durable audit, approval, nonce, and outbox persistence models."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    DateTime, Index, Integer, JSON, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from database.models.base import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class AuditStreamHead(Base):
    __tablename__ = "audit_stream_heads"
    __table_args__ = (
        Index("ix_audit_stream_heads_tenant", "tenant_id"),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    stream_id: Mapped[str] = mapped_column(String(200), primary_key=True)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_digest: Mapped[str | None] = mapped_column(String(64), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (
        UniqueConstraint("tenant_id", "stream_id", "sequence",
                         name="uq_audit_event_stream_sequence"),
        Index("ix_audit_events_tenant_created", "tenant_id", "created_at"),
        Index("ix_audit_events_stream_sequence", "tenant_id", "stream_id", "sequence"),
    )

    event_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False)
    stream_id: Mapped[str] = mapped_column(String(200), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    actor: Mapped[str] = mapped_column(String(200), nullable=False)
    action: Mapped[str] = mapped_column(String(200), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_id: Mapped[str] = mapped_column(String(200), nullable=False)
    outcome: Mapped[str] = mapped_column(String(32), nullable=False)
    correlation_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSON, nullable=False, default=dict
    )
    previous_digest: Mapped[str | None] = mapped_column(String(64), nullable=True)
    digest: Mapped[str] = mapped_column(String(64), nullable=False)


class ApprovalIntent(Base):
    __tablename__ = "approval_intents"
    __table_args__ = (
        Index("ix_approval_intents_tenant_status", "tenant_id", "status"),
        Index("ix_approval_intents_tenant_expiry", "tenant_id", "expires_at"),
    )

    intent_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False)
    request_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    signer_key_id: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="approved")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ConsumedNonce(Base):
    __tablename__ = "consumed_approval_nonces"
    __table_args__ = (
        Index("ix_consumed_nonces_tenant_expiry", "tenant_id", "expires_at"),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    nonce_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    intent_id: Mapped[str] = mapped_column(String(36), nullable=False)
    consumed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class OutboxEvent(Base):
    __tablename__ = "engineering_outbox"
    __table_args__ = (
        Index("ix_engineering_outbox_pending", "published_at", "created_at"),
        Index("ix_engineering_outbox_tenant", "tenant_id", "created_at"),
    )

    outbox_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False)
    event_type: Mapped[str] = mapped_column(String(200), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_error: Mapped[str | None] = mapped_column(Text)
