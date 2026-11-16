# ADR-002: Identity, API Stack and Persistence Direction

- Status: PROPOSED — review required
- Date: 2026-11-17
- Scope: next implementation phase for InfiniteX self-hosted backend

## Context
The repository has a React 18 + TypeScript + Vite frontend and a minimal Node.js built-in HTTP API bootstrap. The bootstrap has no authentication, database driver, schema, migrations, or business routes. Existing architecture notes describe Fastify + TypeScript as the intended API stack, while the first runtime foundation intentionally avoided dependencies.

## Decision proposal
1. Keep a modular-monolith architecture. Do not split into microservices.
2. Keep PostgreSQL as the persistence target, private to the application network.
3. Treat the current built-in HTTP server as a bootstrap/prototype only. Before protected business endpoints are implemented, choose one maintained HTTP framework and standardize the API on TypeScript.
4. Preferred candidate for review: Fastify + TypeScript, with schema validation at every boundary and OpenAPI generation. This is a proposal, not installed or verified.
5. Prefer a small persistence layer using parameterized SQL or a reviewed lightweight query builder. Select the library only after dependency, license, maintenance, security and migration review.
6. Use PostgreSQL-backed durable jobs only when a real asynchronous use case exists. Redis and a separate queue are optional.
7. Keep billing mock-only. No payment provider credentials, live charges, merchant onboarding or payout implementation.

## API framework alternatives
| Option | Advantages | Trade-offs | Decision |
|---|---|---|---|
| Node.js built-in HTTP | Zero framework dependencies; small attack surface | More custom routing, validation, plugins and OpenAPI work | Bootstrap/health checks only |
| Fastify + TypeScript | Mature plugin model, schema-first validation, modularity | Adds dependencies requiring review | Preferred candidate; approval before install |
| Express + TypeScript | Familiar ecosystem | Middleware and validation conventions need standardization | Viable fallback |
| Hono + TypeScript | Small, portable API surface | Adapter/runtime choices need review | Viable alternative |

## Authentication alternatives
- Preferred proposal: opaque server-generated session tokens, stored only as hashes in PostgreSQL; browser receives a Secure, HttpOnly, SameSite cookie.
- Avoid long-lived JWTs in browser storage. If stateless tokens are ever needed for service-to-service use, define rotation, audience, issuer, expiry and revocation separately.
- Password hashing: use a maintained Argon2id implementation after dependency review. Node.js scrypt is a built-in alternative if dependency minimization is more important, with parameters and operational costs documented.
- Password reset email, external identity providers, passkeys and MFA are deferred until a delivery and recovery threat model is approved.

## Approval gates
No dependency installation, schema migration, database connection, authentication endpoint, email integration, or production configuration is authorized by this ADR alone. Review this proposal first; implementation requires separate explicit approval.

## Consequences
The current API remains an unauthenticated health-check skeleton. No user accounts or personal data should be stored in it. Documentation does not prove controls are implemented.
