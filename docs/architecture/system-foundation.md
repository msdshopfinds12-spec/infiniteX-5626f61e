# Phase 1 — System Foundation

## Decisions
1. Python imports use the underscore package name `iq_core`.
2. The existing React application is maintained as the npm workspace `frontend/`; components, hooks, styles, and types are preserved.
3. Repository root coordinates npm workspaces and Python packaging.
4. PostgreSQL is the canonical transactional database target. Compose is local development only; production credentials, schema, migrations, RLS, and tenant authorization are deferred.
5. Vector retrieval and knowledge graph capabilities belong to Company Brain and remain subject to canonical tenant and authorization controls.
6. Secrets are supplied through ignored local environment files or a secret manager. Real credentials must never be committed.

## Phase 1 scope
- Python package metadata and import path.
- Existing Vite application organized under `frontend/`.
- Root npm workspace commands and lockfile metadata.
- Local environment template, ignore rules, and optional PostgreSQL Compose service.
- Setup, development, test, health-check, and backup scripts.
- CI checks for Python tests and frontend lint/build.

## Deferred
- IQ task lifecycle and durable execution (Phase 2).
- Backend API, authentication, and request validation (Phase 3).
- Database schema, migrations, tenant isolation, and repository layer (Phase 4).
- Company Brain, embeddings, vector retrieval, RAG, and graph storage (Phase 5).
- Agent orchestration, execution queues, capability gateway, governance, and production observability (later phases).

## Verification
A green GitHub Actions workflow is required before Phase 1 can be marked fully verified. Local execution in the hosted editing session is not claimed.
