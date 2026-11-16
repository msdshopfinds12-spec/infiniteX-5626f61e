# InfiniteX Self-Hosted Implementation Manifest

Status: proposed target only; these runtime files are not claimed to exist.

## Target layout
- apps/web: existing React/Vite app; preserve until inspected.
- apps/api: Fastify HTTP application.
- apps/worker: background job process.
- packages/contracts: shared schemas and OpenAPI contracts.
- packages/domain: domain types and business rules.
- packages/config: validated environment configuration.
- packages/testkit: synthetic fixtures and test helpers.
- infra/docker: hardened Dockerfiles.
- infra/caddy: reverse proxy configuration.
- infra/compose: development-only Compose profiles.
- database/schema: reviewed schema definitions.
- database/migrations: reviewed migrations; separate approval required.
- database/seeds: synthetic development data only.
- docs/self-hosting: architecture and operations documentation.
- tests/unit, tests/integration, tests/contract, tests/security.

This is a target layout, not a claim that directories already exist. Inspect the current Vite app before moving or renaming files.

## Runtime components
Web client: existing app; API integration pending.
API: authentication, validation and domain services; not implemented.
Worker: durable asynchronous jobs; not implemented.
PostgreSQL: not provisioned.
Caddy: planned only for an approved hosted profile.
Mock billing adapter: documentation exists; runtime is not implemented.
AI adapter: not implemented.

## Proposed configuration keys
NODE_ENV, PORT, APP_ORIGIN, API_PUBLIC_ORIGIN, DATABASE_URL, SESSION_SECRET, LOG_LEVEL, AI_PROVIDER, AI_MODEL and AI_PROVIDER_API_KEY.

Secrets must never be committed or placed in Vite-exposed variables. Provide an env example with placeholders only. Startup must fail closed when required values are missing or malformed.

## Data ownership
Identity owns accounts and sessions. Billing owns plans, checkout sessions, payments, subscriptions, ledger and billing events. Entitlements owns derived access grants. AI owns usage and quota records. Audit owns security events. Cross-module access uses application services and documented read models.

## Required documents
ARCHITECTURE.md, IMPLEMENTATION_MANIFEST.md, IMPLEMENTATION_PLAN.md, SECURITY_BASELINE.md, LOCAL_DEVELOPMENT.md, TEST_STRATEGY.md and AUDIT_REPORT.md.

## Exclusions
No source implementation, dependency installation, lockfile edits, schema migration, service provisioning, credentials, public exposure, deployment, merge or real payment processing in this phase.
