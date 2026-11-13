from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import pytest
from database.models import Base
from iq_core.memory.company_brain import CompanyBrain, MemoryInput
from iq_core.memory.knowledge_graph import KnowledgeGraph
from iq_core.memory.embeddings import EmbeddingUnavailableError, UnconfiguredEmbeddingProvider
from iq_core.memory.vector_memory import VectorMemory


def make_session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                           poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)()


def test_company_brain_persists_and_searches_memory():
    session = make_session()
    brain = CompanyBrain(session, "tenant-a")
    item = brain.remember(MemoryInput("The product roadmap includes vector memory",
                                      metadata={"project": "infiniteGX.7"}))
    found = brain.search("vector memory", 5)
    assert item.memory_id == found[0].memory_id
    assert found[0].metadata["project"] == "infiniteGX.7"
    session.close()


def test_memory_isolated_by_tenant():
    session = make_session()
    CompanyBrain(session, "tenant-a").remember(MemoryInput("private company strategy"))
    assert CompanyBrain(session, "tenant-b").search("private strategy") == []
    session.close()


def test_memory_governance_rejects_empty_and_credential_metadata():
    brain = CompanyBrain(make_session(), "tenant-a")
    with pytest.raises(ValueError):
        brain.remember(MemoryInput("  "))
    with pytest.raises(ValueError):
        brain.remember(MemoryInput("safe text", metadata={"api_key": "do-not-store"}))


def test_embedding_provider_is_explicitly_unconfigured():
    provider = UnconfiguredEmbeddingProvider()
    with pytest.raises(EmbeddingUnavailableError):
        provider.embed("text")


def test_vector_memory_lists_nearest_embedded_records():
    session = make_session()
    brain = CompanyBrain(session, "tenant-a")
    brain.remember(MemoryInput("vector item"))
    assert VectorMemory(session, "tenant-a").nearest([1.0, 0.0]) == []
    session.close()


def test_knowledge_graph_edges_are_tenant_scoped():
    session = make_session()
    KnowledgeGraph(session, "tenant-a").add_edge("infiniteGX.7", "contains", "Company Brain")
    assert len(KnowledgeGraph(session, "tenant-a").list_edges("infiniteGX.7")) == 1
    assert KnowledgeGraph(session, "tenant-b").list_edges("infiniteGX.7") == []
    session.close()
