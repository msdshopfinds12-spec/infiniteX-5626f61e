# InfiniteX Self-Hosted Runtime Foundation Report

**Branch:** `feat/provider-neutral-billing-sandbox`  
**Scope:** Dependency-free API bootstrap, local-only PostgreSQL development profile, and CI definition.  
**Deployment:** Not performed.  
**Migrations:** Not created or executed.  
**Live billing:** Not implemented.

## Changes created

### API package
- `apps/api/package.json`: isolated Node.js 22 package with start, syntax-check and built-in test scripts; no third-party dependencies.
- `apps/api/src/config.mjs`: validated host, port and environment configuration; loopback default.
- `apps/api/src/app.mjs`: minimal HTTP handler, health/readiness routes, stable JSON errors, request IDs and conservative response headers.
- `apps/api/src/server.mjs`: bounded HTTP header/request timeouts, request-header count limit, client error handling and graceful shutdown.
- `apps/api/test/app.test.mjs`: Node built-in test suite for health, readiness, not-found, method rejection and configuration validation.
- `apps/api/README.md`: local run instructions and explicit security limitations.

### Local database development
- `infra/compose/docker-compose.yml`: PostgreSQL 17 development service; host binding is loopback-only and container network is internal.
- `infra/compose/.env.example`: placeholder-only local environment template.
- `infra/compose/README.md`: safe local setup and data-preservation guidance.

### CI
- `.github/workflows/self-hosted-api.yml`: Node.js 22 syntax checks and built-in tests, read-only repository permission, no secrets and no deployment steps.

## Deliberate safety choices
- No external npm dependencies or lockfile changes.
- No database driver, ORM, database connection, schema or migration.
- No auth endpoints or user-data routes.
- No public network binding by default; API binds to `127.0.0.1`.
- PostgreSQL port binds to `127.0.0.1`; no public database exposure.
- Database password is supplied locally and is not committed.
- No payment provider, merchant credentials, live charges or payouts.
- No merge, public deployment, DNS or firewall changes.

## Important limitations
This is a foundation only, not a complete production backend. It does not yet implement authentication, authorization, rate limiting, CORS/CSRF policy, persistent audit logs, PostgreSQL integration, request-body validation, AI orchestration, or billing runtime. Do not expose it publicly or use it for real user data.

The API currently supports only GET/HEAD health and readiness routes. Business routes are intentionally absent until identity, authorization, persistence and validation are designed and reviewed.

## Evidence status

| Check | Status |
|---|---|
| Files committed to feature branch | VERIFIED |
| No third-party API dependencies added | VERIFIED from package manifest |
| Default API host is loopback | VERIFIED from source |
| Compose PostgreSQL host port is loopback-only | VERIFIED from Compose source |
| API syntax check executed | NOT RUN in this environment |
| API tests executed | NOT RUN in this environment |
| GitHub Actions workflow result | PENDING / NOT VERIFIED |
| Docker Compose config validated | NOT RUN |
| PostgreSQL container started | NOT RUN |
| Runtime security audit | NOT PERFORMED |
| Deployment | NOT PERFORMED |

## Next gate
Inspect CI results after GitHub runs the workflow. Fix any failures with evidence. Then separately review authentication/session design and the PostgreSQL schema proposal. Do not add migrations or connect the API to a database until those designs receive explicit approval.
