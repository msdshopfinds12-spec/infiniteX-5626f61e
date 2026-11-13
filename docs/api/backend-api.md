# Backend API — Phase 3

## Run locally
Install the project and development dependencies, configure `INFINITEGX_API_AUTH_TOKEN`
in the local environment, then run:

```bash
uvicorn backend.app.main:app --reload
```

Interactive API documentation is exposed by FastAPI at `/docs` while the service is running.

## Endpoints
- `GET /health` — public liveness response.
- `POST /api/v1/tasks` — create a task (Bearer token required).
- `GET /api/v1/tasks/{task_id}` — retrieve a task (Bearer token required).
- `POST /api/v1/tasks/{task_id}/execute` — execute a registered handler (Bearer token required).

## Authentication
Protected routes require `Authorization: Bearer <token>` and the server must be configured
with `INFINITEGX_API_AUTH_TOKEN`. If no token is configured, protected routes fail closed
with HTTP 503. Never commit a real token to the repository.

## Current limitations
The API uses the process-local IQ Engine from Phase 2. Tasks are not durable and multiple
workers do not share task state. No user identity, sessions, OAuth, RBAC, tenant isolation,
database persistence, rate limiting, or distributed execution is implemented yet. Those
capabilities belong to later phases.
