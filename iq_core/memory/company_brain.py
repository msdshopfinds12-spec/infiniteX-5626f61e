"""Tenant-scoped Company Brain service."""
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from collections.abc import Sequence
from sqlalchemy import select, text
from sqlalchemy.orm import Session
from database.models.memory import MemoryRecord
from iq_core.memory.embeddings import EmbeddingProvider
from iq_core.memory.memory_governance import validate_memory
from iq_core.memory.retrieval import hybrid_score


@dataclass(frozen=True)
class MemoryInput:
    content: str
    source: str = "user"
    metadata: dict[str, Any] | None = None


@dataclass(frozen=True)
class MemorySearchResult:
    memory_id: str
    content: str
    source: str
    metadata: dict[str, Any]
    score: float
    created_at: datetime


class CompanyBrain:
    def __init__(self, session: Session, tenant_id: str,
                 embedding_provider: EmbeddingProvider | None = None) -> None:
        self.session, self.tenant_id = session, tenant_id
        self.embedding_provider = embedding_provider

    def _set_tenant(self) -> None:
        if self.session.get_bind().dialect.name == "postgresql":
            self.session.execute(text("SELECT set_config('app.tenant_id', :tenant_id, true)"),
                                 {"tenant_id": self.tenant_id})

    def remember(self, item: MemoryInput) -> MemoryRecord:
        content, metadata = validate_memory(item.content, item.metadata or {})
        embedding = None
        if self.embedding_provider is not None:
            embedding = list(self.embedding_provider.embed(content))
            if len(embedding) != self.embedding_provider.dimensions:
                raise ValueError("Embedding provider returned an unexpected vector dimension")
        self._set_tenant()
        record = MemoryRecord(tenant_id=self.tenant_id, content=content,
                              source=item.source[:100], metadata_json=metadata,
                              embedding=embedding)
        self.session.add(record)
        self.session.commit()
        self.session.refresh(record)
        return record

    def search(self, query: str, limit: int = 10) -> list[MemorySearchResult]:
        normalized = query.strip()
        if not normalized:
            raise ValueError("Search query cannot be empty")
        if not 1 <= limit <= 100:
            raise ValueError("limit must be between 1 and 100")
        query_vector: Sequence[float] | None = None
        if self.embedding_provider is not None:
            query_vector = self.embedding_provider.embed(normalized)
            if len(query_vector) != self.embedding_provider.dimensions:
                raise ValueError("Embedding provider returned an unexpected vector dimension")
        self._set_tenant()
        rows = self.session.scalars(select(MemoryRecord).where(
            MemoryRecord.tenant_id == self.tenant_id
        )).all()
        ranked = sorted(rows, key=lambda row: hybrid_score(
            normalized, row.content, query_vector, row.embedding), reverse=True)
        return [MemorySearchResult(memory_id=row.memory_id, content=row.content,
                source=row.source, metadata=row.metadata_json, score=hybrid_score(
                normalized, row.content, query_vector, row.embedding),
                created_at=row.created_at) for row in ranked[:limit]]
