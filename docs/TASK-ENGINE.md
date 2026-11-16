# Task Engine — persistence foundation

## API
- POST /api/v1/tasks: create a queued task; requires an 8–160 character idempotency key.
- GET /api/v1/tasks: list up to 100 tenant-scoped tasks.
- GET /api/v1/tasks/:id: read a tenant-scoped task.
- POST /api/v1/tasks/:id/cancel: cancel only while queued.
- POST /api/v1/agents and GET /api/v1/agents: tenant-scoped agent registry.

All endpoints require a valid OIDC bearer token and PostgreSQL configuration. The issuer + subject must map to a provisioned app_users record. Tenant context is set transaction-locally and RLS policies enforce row isolation.

## Explicit limitations
- Tasks are persisted as queued records only. There is no worker, queue broker, scheduler, retry engine, or execution endpoint yet.
- Agent records are metadata only; no tools or autonomous execution are attached.
- Cancellation only succeeds while status is queued.
- Idempotency keys are unique within a tenant. Reuse returns the original task record.
- Database migration remains unapplied. These endpoints are unavailable until an administrator applies the reviewed migration and provisions users.

## Next safe architecture
Use a queue adapter interface and transactional outbox before adding workers. Workers must claim tasks with row locks and leases, enforce tenant context, use bounded retries and deadlines, and persist every state transition. Do not run user-provided arbitrary code or shell commands inside workers.