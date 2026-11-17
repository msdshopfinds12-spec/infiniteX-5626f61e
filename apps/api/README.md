# InfiniteX API Foundation

This package is a **read-only runtime foundation**, not a production-authenticated backend.

## Requirements

- Node.js 22 or newer
- No third-party runtime dependencies

## Local commands

From this directory:

```sh
npm run check
npm start
```

The check command runs Node syntax checks and the built-in Node test runner. No database, secrets, provider credentials, or paid services are required.

## Current endpoints

| Endpoint | Behavior |
|---|---|
| `GET /healthz` | Process liveness only |
| `GET /readyz` | Returns 503 until required dependencies are actually integrated |
| `GET /api/v1/status` | Reports capability state as not configured / disabled |
| Other paths | 404 |
| Other methods | 405 |

## Trust and safety boundary

- The service does not authenticate users.
- The service does not authorize workspace access.
- The service does not connect to a database.
- The service does not execute AI providers or tools.
- No client-supplied tenant/workspace identifier is treated as identity.
- CORS is exact-origin allowlist only when configured.
- Production startup fails unless the host and allowed origins are explicitly configured.
- Health and status responses are non-cacheable and include baseline security headers.
- The runtime does not accept mutation methods.

Do not expose this service as a public application API until authentication, authorization, persistent session storage, CSRF protection for cookie-authenticated mutations, durable audit, rate/quota controls, and database isolation are implemented and independently tested.

## Authentication and authorization primitives

The package includes isolated, unit-testable primitives for opaque session tokens, CSRF token hashing and verification, secure `__Host-` session cookie serialization, repository-injected session lifecycle, and deny-by-default workspace role policy. These modules are **not wired into HTTP routes**. No production login, identity provider, persistent database repository, session rotation endpoint, or end-to-end authorization middleware exists yet. The session service requires a persistent repository adapter supplied by a later reviewed integration.

## CI

The Phase 3D-4 workflow runs Node syntax checks and tests on pull requests and pushes to the trusted backend branch. CI uses no repository secrets and requests only `contents: read`.

GitHub Actions are pinned to immutable commit SHAs. Pin updates must be reviewed and refreshed deliberately.

## Explicitly not done

- No migrations were created or applied.
- No secrets were added.
- No external AI provider was called.
- No paid service was introduced.
- No PR was opened or merged.
- No deployment was performed.

A green result from this package's tests would verify only this isolated foundation, not production security or end-to-end backend readiness.
