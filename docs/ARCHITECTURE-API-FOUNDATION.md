# InfiniteGX API foundation

## Decision

Keep the existing React/Vite frontend intact and add an independently deployable Fastify API under `server/`. This is lower-risk than rewriting the current frontend into a monorepo.

## Runtime flow

Browser frontend -> HTTPS API -> validated route -> application service -> repository/provider adapter -> external system.

The current implementation stops at the route boundary. Authentication, persistence, agent execution, AI provider calls, and usage metering are intentionally marked not implemented.

## Components

- Fastify 5: HTTP server and plugin lifecycle.
- Zod: environment validation.
- Helmet: baseline security headers.
- CORS allowlist: explicit browser-origin policy.
- Rate limit: per-process request throttling baseline.
- Pino/Fastify logger: structured logs with credential redaction.
- Vitest: API route tests.

## Health semantics

- `/health/live`: process is running.
- `/health/ready`: returns 503 until a real database adapter and connectivity check exist. A configured URL is not considered proof of readiness.

## Next engineering phases

1. Lock dependency versions and commit a generated lockfile.
2. Add a database adapter after confirming whether the existing Supabase project is the backend.
3. Add authentication and authorization before user-specific endpoints.
4. Add AI provider adapters with server-side secrets, provider timeouts, retry policy, idempotency, per-user quotas, and cost ceilings.
5. Persist usage events before exposing billing or token-usage metrics.
6. Add integration tests and end-to-end tests before deployment.
