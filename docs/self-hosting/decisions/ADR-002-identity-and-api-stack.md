# ADR-002: Identity, API Stack and Persistence Direction

- Status: PROPOSED — review required
- Date: 2026-11-17
- Scope: next implementation phase for InfiniteX self-hosted backend

## Context
The repository has a React + TypeScript + Vite frontend and a minimal Node.js built-in HTTP API bootstrap. The API has no authentication, database driver, schema, migrations, or business routes. Earlier identity planning recommends evaluating OIDC rather than inventing custom password authentication. This ADR reconciles the runtime bootstrap with that identity direction.

## Decision proposal
1. Keep a modular-monolith architecture; do not split into microservices.
2. Keep PostgreSQL as the persistence target, private to the application network.
3. Keep the built-in HTTP server as a minimal bootstrap only. Before protected business endpoints, select a maintained HTTP framework and standardize the API on TypeScript.
4. Preferred API candidate: Fastify + TypeScript with schema validation and OpenAPI. This is proposed, not installed or verified.
5. Preferred identity direction: evaluate a self-hosted OIDC provider first. Do not build custom password storage, reset, MFA and recovery flows as the default.
6. Keep API authorization in InfiniteX. OIDC proves identity; it does not grant workspace or resource access.
7. Prefer a small persistence layer using parameterized SQL or a reviewed query builder after dependency and license review.
8. Redis and separate queues remain optional. Use PostgreSQL-backed jobs only when a real use case exists.
9. Billing remains mock-only.

## API framework alternatives
| Option | Advantages | Trade-offs | Decision |
|---|---|---|---|
| Node.js built-in HTTP | Zero framework dependencies | Custom routing, validation and OpenAPI burden | Bootstrap only |
| Fastify + TypeScript | Schema-first validation, plugin model, modularity | Dependencies require review | Preferred candidate |
| Express + TypeScript | Familiar ecosystem | Middleware and validation conventions need standardization | Viable fallback |
| Hono + TypeScript | Small, portable API surface | Adapter/runtime choices need review | Viable alternative |

## Identity alternatives
| Option | Advantages | Trade-offs | Direction |
|---|---|---|---|
| Self-hosted OIDC | Mature protocols; avoids custom credential lifecycle | Provider operations, updates, backups | Preferred for production evaluation |
| Managed OIDC | Lower operational burden | External dependency, pricing and data-processing review | Optional, not required |
| Custom password auth | Full control | High security and recovery burden | Avoid absent specialist review |
| Development mock identity | Fast, credential-free tests | Not real authentication | Tests only |

OIDC flow should use Authorization Code + PKCE, and validate issuer, audience, signature, state, nonce and expiry. Browser and Android-native client flows require separate review.

## Persistence direction
Propose local users, identity links, workspaces, memberships, optional opaque sessions and audit events. Do not duplicate OIDC-owned password credentials. Use server-side tenant authorization and database constraints.

## Approval gates
No provider installation, framework/dependency installation, database connection, schema migration, authentication endpoint, email integration, or production configuration is authorized by this ADR alone. Approve provider operations, client flows, role matrix, schema and retention before implementation.

## Consequences
The current API remains an unauthenticated health-check skeleton. No user accounts or personal data should be stored in it. Documentation does not prove controls are implemented.
