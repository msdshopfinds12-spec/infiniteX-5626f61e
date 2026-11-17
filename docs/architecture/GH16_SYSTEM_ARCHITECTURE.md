# GH-16 — InfiniteX System Architecture

**Status:** Proposed architecture; implementation not yet verified  
**Target branch:** `feat/gh16-infiniteX-integration`  
**Baseline:** `main` at `76b821789f52aa6f403bacb0508c6c989fdfa3a5`

## 1. Purpose

Define a safe, incremental architecture for evolving InfiniteX from a frontend dashboard/demo into a maintainable application with verifiable backend capabilities. This document is a plan, not evidence that any proposed component exists or works.

## 2. Evidence and known constraints

Previously inspected repository evidence indicates:
- `main` contains a React/Vite dashboard with sample agents, logs, pipelines, and dashboard metrics.
- The separate branch `feat/provider-neutral-billing-sandbox` contains substantial backend/security/database work and is 191 commits ahead of `main` at the prior comparison.
- That feature branch is not a small backend patch. It contains broader auth, database, runtime, billing/provider-neutral, research, and frontend changes. Do not merge it wholesale.
- The feature branch has two server implementation areas (`apps/api` and `server`) that require reconciliation.
- A historical backend CI run reported 67/67 tests passed, but that does not prove the current branch head, frontend build, production deployment, or live integrations are verified.
- Live frontend-to-API integration, production identity provider, deployment security, and mobile accessibility QA remain unverified based on prior inspection.

Re-fetch source and current branch state before implementation. Historical observations must not be presented as current runtime facts.

## 3. Architectural principles

1. **Modular monolith first:** one deployable API with explicit modules; avoid premature microservices.
2. **Provider neutrality:** integrations behind interfaces and adapters; no vendor-specific logic in domain modules.
3. **Evidence-based UI:** show `Not connected`, `Sample data`, `Not verified`, or measured values accurately.
4. **Secure by default:** deny-by-default authorization, server-side validation, least privilege, secure sessions, and auditable changes.
5. **Free-tier aware:** prefer existing/free-tier services and local development; document quotas and limits. Free does not mean unlimited.
6. **Incremental migration:** preserve working main-branch behavior; isolate changes and keep rollback possible.
7. **Mobile-first UX:** responsive layouts, accessible controls, keyboard support, and clear loading/error/empty states.
8. **Human approval:** no production deployment, billing activation, destructive migration, merge, or public release without explicit approval.

## 4. Target logical architecture

```text
React + TypeScript + Vite (PWA optional)
  ├── Presentation: pages, accessible components, design tokens
  ├── Application: query/mutation hooks, state, API client
  ├── Contracts: request/response schemas, generated OpenAPI types
  └── Telemetry UI: only measured backend values; sample values labeled
                 |
                 | HTTPS / JSON / versioned API
                 v
TypeScript API — modular monolith
  ├── Identity & session boundary
  ├── Workspace membership & authorization
  ├── Agents (registry/configuration)
  ├── Tasks (lifecycle and ownership)
  ├── Activity/audit events
  ├── Provider adapters (AI and external services)
  └── Health/readiness and observability
                 |
                 v
PostgreSQL
  ├── workspace-scoped records
  ├── relational constraints
  ├── migrations with rollback notes
  └── row-level security where supported and tested
```

This diagram is a target design, not a statement of deployed components.

## 5. Technology selection gates

| Concern | Preferred evaluation | Alternative | Selection gate |
|---|---|---|---|
| Frontend | Existing React + TypeScript + Vite | PWA enhancement | Preserve current stack unless evidence supports change |
| API | TypeScript modular monolith | Hono or Fastify | Compare existing dependencies, runtime, validation, testability |
| Database | PostgreSQL | SQLite for local-only tests | Production DB choice requires deployment and cost review |
| Validation | Zod or JSON Schema | TypeBox | One canonical contract strategy |
| API contract | OpenAPI | Shared TS types | Runtime validation remains mandatory |
| Tests | Vitest / Node test runner | Existing project runner | Follow actual package scripts |
| Browser QA | Playwright | Manual documented checklist | Automated checks where supported |
| Identity | OIDC-compatible provider abstraction | Local mock identity for tests | Never ship mock auth as production auth |
| AI providers | Provider-neutral adapter | Local/free-tier provider | Quotas, data handling, and availability documented |

Do not add a dependency until its need, maintenance status, license, bundle/runtime impact, and free-tier implications are assessed.

## 6. Module boundaries

- **Identity:** authentication proof and session lifecycle; never trusts client-supplied user IDs.
- **Authorization:** workspace membership, role and resource policy; default deny.
- **Agents:** metadata and configuration; execution capability must be explicitly implemented and tested.
- **Tasks:** validated lifecycle transitions and workspace ownership.
- **Audit:** append-only security-relevant event record; redact secrets and personal data.
- **Providers:** adapters with timeouts, error normalization, quota handling, and no embedded secrets.
- **Health:** liveness and readiness are distinct; readiness checks only required dependencies.

## 7. API design baseline

- Prefix application endpoints with `/api/v1`.
- Use JSON request/response schemas and consistent error envelopes.
- Validate all untrusted input on the server.
- Authenticate before accessing protected resources.
- Authorize every resource by workspace membership and ownership.
- Use pagination with bounded page size.
- Add idempotency only for operations that need retry-safe semantics.
- Keep `/healthz` lightweight; `/readyz` reports dependency readiness without leaking secrets.

## 8. Reliability and observability

- Structured logs with request/correlation IDs.
- Never log passwords, tokens, cookies, API keys, or raw sensitive payloads.
- Explicit request timeouts and bounded retries only for safe/idempotent operations.
- Rate limits at the appropriate trust boundary.
- Readiness checks must not trigger mutations.
- UI must distinguish loading, empty, stale, error, demo, and live states.

## 9. Security baseline

- Deny by default; enforce authorization server-side.
- Secure, HttpOnly, SameSite cookies when cookie sessions are used; define CSRF strategy.
- Rotate and expire sessions; revoke on logout and security events.
- Keep secrets in environment/secret management, never source control.
- Parameterize database queries.
- Use least-privilege database roles.
- Test cross-workspace isolation and role boundaries.
- Apply dependency and secret scanning where available.
- Do not claim compliance or production security from passing unit tests alone.

## 10. Delivery sequence

1. Re-inspect branch and file tree.
2. Confirm current frontend/backend entrypoints and package scripts.
3. Resolve duplicate server architecture decision.
4. Define API and data contracts.
5. Implement one vertical slice (health → identity boundary → workspace-scoped read).
6. Add tests and run actual checks.
7. Integrate frontend through typed API client.
8. Complete security, accessibility, and mobile QA.
9. Prepare release checklist; wait for human approval.

## 11. Non-goals for this phase

- No autonomous self-modifying production code.
- No unreviewed code generation merged into main.
- No paid services or billing activation by default.
- No wholesale merge of the 191-commit feature branch.
- No microservices, Kubernetes, Redis, or message broker unless a measured requirement justifies them.
- No claims of live AI-agent execution until the execution pipeline exists and is tested.

## 12. Acceptance criteria

Architecture is ready for implementation only when:
- Current entrypoints and package scripts are re-inspected.
- One canonical API server is selected.
- API/domain ownership boundaries are documented.
- Authn/authz model and threat assumptions are reviewed.
- Data model and migration/rollback strategy are approved.
- Each proposed capability has an explicit test plan and evidence status.
