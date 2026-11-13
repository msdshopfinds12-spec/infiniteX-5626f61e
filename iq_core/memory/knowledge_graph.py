"""Tenant-scoped lightweight knowledge graph persistence."""
from sqlalchemy import select, text
from sqlalchemy.orm import Session
from database.models.memory import KnowledgeEdge


class KnowledgeGraph:
    def __init__(self, session: Session, tenant_id: str) -> None:
        self.session, self.tenant_id = session, tenant_id

    def add_edge(self, source: str, relation: str, target: str) -> KnowledgeEdge:
        self.session.execute(text("SELECT set_config('app.tenant_id', :tenant_id, true)")
                             if self.session.get_bind().dialect.name == "postgresql"
                             else text("SELECT 1"),
                             {"tenant_id": self.tenant_id} if self.session.get_bind().dialect.name == "postgresql" else {})
        edge = KnowledgeEdge(tenant_id=self.tenant_id, source=source.strip(),
                             relation=relation.strip(), target=target.strip())
        self.session.add(edge)
        self.session.commit()
        self.session.refresh(edge)
        return edge

    def list_edges(self, entity: str, limit: int = 100) -> list[KnowledgeEdge]:
        if self.session.get_bind().dialect.name == "postgresql":
            self.session.execute(text("SELECT set_config('app.tenant_id', :tenant_id, true)"),
                                 {"tenant_id": self.tenant_id})
        stmt = select(KnowledgeEdge).where(
            KnowledgeEdge.tenant_id == self.tenant_id,
            (KnowledgeEdge.source == entity) | (KnowledgeEdge.target == entity),
        ).limit(limit)
        return list(self.session.scalars(stmt))
