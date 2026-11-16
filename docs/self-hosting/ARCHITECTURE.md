# InfiniteX Self-Hosted Hybrid Architecture

Status: architecture plan only. Runtime implementation, provisioning, migrations, deployment and merge are not authorized.

## Decision
Build a portable, self-managed modular monolith. Android is the primary authoring and review device; it is not assumed to be a production Docker host. Run Docker and PostgreSQL on a compatible Linux computer or independently controlled Linux server when approved.

## Stack
- Existing React + TypeScript + Vite web client.
- Node.js LTS + TypeScript + Fastify API.
- OpenAPI and shared runtime-validated contracts.
- PostgreSQL for persistence.
- Drizzle ORM or parameterized SQL, final choice after a dependency review.
- PostgreSQL-backed jobs initially; Redis is optional, not mandatory.
- Docker Compose for reproducible development.
- Caddy for TLS reverse proxy only in an approved hosted profile.
- Vitest and API integration tests.
- Structured logs initially; OpenTelemetry can be added when useful.

## Topology
Android authoring and review -> Git feature branch -> portable build artifact -> optional Caddy reverse proxy -> React web client and Fastify API -> domain modules and worker -> private PostgreSQL network -> encrypted backups.

The API and database are not directly exposed to the public internet. PostgreSQL has no public port mapping.

## Domain modules
Identity; authorization; plans; mock billing; subscriptions; server-derived entitlements; AI orchestration; file metadata; durable jobs; audit events; operations and health checks. Modules use typed application services rather than direct cross-module table writes.

## Security
Validate every request server-side. Authenticate identity and authorize every protected resource. Use secure HttpOnly SameSite cookies with CSRF defenses for browser mutations. Hash passwords using a reviewed current algorithm. Apply rate limits, request limits, timeouts, strict CORS, security headers and parameterized SQL. Keep secrets outside Git and browser bundles. Use least-privilege database roles. Redact credentials and personal data from logs. Encrypt backups and test restoration.

## Billing
Existing billing remains mock-only. Client redirects cannot establish payment success. Future real payment integration requires a separately approved design and an eligible adult merchant account owner who completes provider onboarding and applicable KYC. No live charges, payouts or merchant credentials are in scope.

## AI safety
AI is an adapter-based orchestration layer, not privileged self-modifying code. Tool calls require allowlists, schema validation, scoped permissions, timeouts, budgets and audit records. Model output is untrusted. Shell execution, code writes, migrations, deployment and public publishing require human approval. Self-hosted inference is optional and hardware-dependent; it does not mean unlimited tokens.

## Deployment profiles
- Development: Docker Compose on compatible Linux, loopback ports, synthetic data.
- Private test: isolated server/network, no real payments.
- Production candidate: separate approval for host, firewall, domain, TLS, backups, monitoring, incident response and data-protection review.

## Non-goals
No Kubernetes, premature microservices, mandatory Redis, paid cloud backend, live payment provider, public deployment or automatic privileged self-modification in the initial phase.

## Gates
Approve dependencies, authentication, schema proposal, development environment and test strategy before runtime implementation. SQL migrations, public hosting, DNS/firewall changes and release each require separate approval.
