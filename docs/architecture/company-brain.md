# Phase 5 — Company Brain

Company Brain is a tenant-scoped knowledge and memory service built on the Phase 4 PostgreSQL
transactional database. It stores text memories, source labels, JSON metadata, optional embedding
vectors, and lightweight subject-relation-object knowledge edges.

## Components
- MemoryManager: application facade.
- CompanyBrain: persist, validate, and retrieve memories.
- EmbeddingProvider: provider contract; no external model/provider is configured by default.
- Retrieval: lexical ranking, with optional cosine similarity for stored and query embeddings.
- VectorMemory: nearest-neighbor ranking over persisted vectors in application code.
- KnowledgeGraph: tenant-scoped edge persistence.
- Memory governance: content and metadata bounds plus rejection of credential-like top-level keys.

## API
- POST /api/v1/memory — persist a memory.
- GET /api/v1/memory/search?q=...&limit=... — hybrid search.

Both routes require the existing API bearer token and X-Tenant-ID UUID. Repository-level tenant
filters are always applied; PostgreSQL RLS policies add a database-level tenant condition.

## Deliberate limitations
- Embedding integration is **NOT_CONFIGURED**. Retrieval therefore uses lexical scoring until
  an approved provider adapter is configured.
- Embedding vectors are JSON and cosine similarity is computed in application code. This is a
  portable baseline, not a pgvector index or a high-scale vector database.
- The current shared bearer token is not cryptographically bound to a tenant identity. The
  tenant header is a namespace selector, not authorization. Phase 10 must bind principal and
  tenant permissions before production multi-tenant use.
- Knowledge graph currently stores edges; graph traversal, entity resolution, and GraphRAG
  are future extensions.
- PostgreSQL RLS behavior requires live PostgreSQL verification; SQLite CI tests only validate
  application-level tenant filters.
