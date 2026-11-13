"""Vector-memory operations over persisted JSON vectors.

This is a portable baseline. It computes similarity in application code; a dedicated
pgvector index is a later scale optimization and is not claimed here.
"""
from collections.abc import Sequence
from sqlalchemy import select
from sqlalchemy.orm import Session
from database.models.memory import MemoryRecord
from iq_core.memory.retrieval import cosine_similarity


class VectorMemory:
    def __init__(self, session: Session, tenant_id: str) -> None:
        self.session, self.tenant_id = session, tenant_id

    def nearest(self, query_vector: Sequence[float], limit: int = 10):
        rows = self.session.scalars(select(MemoryRecord).where(
            MemoryRecord.tenant_id == self.tenant_id
        )).all()
        embedded = [row for row in rows if row.embedding is not None]
        return sorted(embedded, key=lambda row: cosine_similarity(
            query_vector, row.embedding or []), reverse=True)[:limit]
