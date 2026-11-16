# InfiniteGX architecture

## Boundaries
- Frontend: existing React + Vite application.
- API: isolated Node.js 22 + Hono service in apps/api.
- Railway: proposed API host only; this branch does not provision Railway resources.
- Data: no production database is connected.

## Request flow
Browser -> frontend -> HTTPS API -> JWT verification -> input validation -> AI provider adapter -> bounded upstream request -> sanitized response.

## Modules
- config: fail-fast environment parsing.
- auth: remote JWKS JWT verification with issuer and audience checks.
- rate-limit: per-process, per-subject fixed-window limit.
- health: process liveness and dependency configuration indicators.
- AI route: authenticated generation endpoint.
- provider adapter: OpenAI-compatible interface with timeout.

## Scaling limitations
The in-memory rate limiter is not shared across replicas and resets on restart. Replace it with Redis or another shared store before multi-replica production. No durable queue exists. Long-running work must move to a durable queue/worker architecture.

Readiness currently reports configuration; it does not prove database or AI provider availability.