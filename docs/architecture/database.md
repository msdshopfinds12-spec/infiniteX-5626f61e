# Phase 4 — Database and Persistence

PostgreSQL is the canonical transactional database. SQLAlchemy 2.x models and tenant-scoped
repositories provide persistence; Alembic owns schema migrations. The local Compose service
uses PostgreSQL 16.

Task records persist identity, tenant namespace, objective, input/output, status, errors,
timestamps, and attempt count. API task create/read/execute operations now use the repository.

Every task request requires a UUID X-Tenant-ID. Repository queries include tenant scope.
The PostgreSQL migration enables and forces row-level security using transaction-local
app.tenant_id context.

**Security limitation:** the shared API bearer token is not bound to a tenant identity. A caller
with that token can choose a tenant header. These are tenant-scoping primitives, not a complete
authorization system. Phase 10 must bind authenticated principals to authorized tenant IDs.

Run alembic upgrade head after configuring INFINITEGX_DATABASE_URL. The app does not auto-create
production tables. A crash after an atomic task claim can leave RUNNING state; recovery and
lease expiry remain future work.
