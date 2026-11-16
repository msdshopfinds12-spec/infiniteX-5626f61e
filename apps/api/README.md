# InfiniteX API — Runtime Foundation

This is the first isolated self-hosted API bootstrap. It deliberately uses Node.js built-ins only: no web framework, database driver, ORM, authentication package or external service is required at this stage.

## Requirements
- Node.js 22 or newer.
- npm (bundled with Node.js).

## Run locally
From this directory:

```sh
npm run check
npm test
npm start
```

The server defaults to `127.0.0.1:4100`, so it listens on loopback only. Override with `API_HOST` and `API_PORT` only in a deliberately configured private environment. Do not bind to a public interface without a separate infrastructure/security review.

## Endpoints
- `GET /healthz`: process liveness response.
- `GET /readyz`: readiness response. The initial implementation has no external dependencies, so its default readiness check returns true.
- Other paths return a stable JSON 404.
- Non-GET/HEAD methods return 405.

## Security scope
The bootstrap sets conservative response headers, disables response caching, limits HTTP headers and timeouts, generates a server-side request ID, returns generic errors and handles graceful shutdown.

This is not a complete production API. Authentication, authorization, database access, rate limiting, CORS policy, CSRF defenses, request schemas, audit persistence, and operational monitoring must be designed and tested before protected business endpoints are added.

## Explicit exclusions
No database connection, schema, migration, payment provider, secrets, public hosting, or live billing is included. Billing remains mock-only.
