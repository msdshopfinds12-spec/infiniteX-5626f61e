# API contract

All protected endpoints require Authorization: Bearer <OIDC JWT>. JWT issuer, audience and JWKS are configured through environment variables.

## Health
- GET /api/health — liveness.
- GET /api/ready — readiness, including PostgreSQL SELECT 1 when DATABASE_URL is configured.

## AI
- POST /api/v1/ai/generate — bounded synchronous generation; requires auth and configured provider.

## Agents
- GET /api/v1/agents — list up to 100 agents for the authenticated tenant.
- POST /api/v1/agents — create metadata record. Body: { "name": "Research Agent", "description": "Optional description" }.

## Tasks
- GET /api/v1/tasks — list up to 100 tenant-scoped tasks.
- POST /api/v1/tasks — create a queued task. Body: { "idempotencyKey": "request-unique-123", "agentId": "optional-uuid", "input": { "kind": "example" } }.
- GET /api/v1/tasks/:id — read one tenant-scoped task.
- POST /api/v1/tasks/:id/cancel — cancel a task only while it remains queued.

Task creation does not execute code. No worker or queue consumer is included yet. Reusing an idempotency key in the same tenant returns the original task.

## Error model
Errors use { "error": { "code": "STABLE_CODE", "message": "Safe client-facing message" } }. Never return provider credentials, SQL details, stack traces, prompts, or raw upstream errors.

## Availability
Agents/tasks require DATABASE_URL, the reviewed schema migration, and an administrative app_users issuer/subject mapping. No schema is applied automatically.