from datetime import datetime, timezone
from typing import Any
from uuid import uuid4
from sqlalchemy import DateTime, Index, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from database.models.base import Base


class MemoryRecord(Base):
    __tablename__ = "memory_records"
    __table_args__ = (Index("ix_memory_tenant_created", "tenant_id", "created_at"),)
    memory_id: Mapped[str] = mapped_column(String(36), primary_key=True,
                                           default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(String(100), nullable=False, default="user")
    metadata_json: Mapped[dict[str, Any]] = mapped_column("metadata", JSON, nullable=False, default=dict)
    embedding: Mapped[list[float] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False,
                                                  default=lambda: datetime.now(timezone.utc))


class KnowledgeEdge(Base):
    __tablename__ = "knowledge_edges"
    __table_args__ = (Index("ix_knowledge_tenant_source", "tenant_id", "source"),
                      Index("ix_knowledge_tenant_target", "tenant_id", "target"))
    edge_id: Mapped[str] = mapped_column(String(36), primary_key=True,
                                         default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False)
    source: Mapped[str] = mapped_column(String(500), nullable=False)
    relation: Mapped[str] = mapped_column(String(100), nullable=False)
    target: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False,
                                                  default=lambda: datetime.now(timezone.utc))
