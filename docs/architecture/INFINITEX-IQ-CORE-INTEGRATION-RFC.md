# InfiniteX Architecture Integration RFC

- Status: PROPOSED — NOT APPROVED FOR IMPLEMENTATION OR RELEASE
- Scope: architecture, repository boundaries, backend selection, integration contracts, test and release gates
- Target: InfiniteX Vite/React/TypeScript application
- Related systems: Ashaa-INX Supabase workflow runtime; infiniteGX.7 IQ Core Python repository
- Cost constraint: free-first; no paid infrastructure assumed
- Safety: no production writes, secrets, billing changes, migrations, merges, or deployments authorized by this RFC

## 1. Executive decision

Do not combine repositories by copying code or merging branches. Preserve each system's canonical ownership and integrate through explicit contracts.

Recommended target topology:

1. InfiniteX remains the user-facing Vite + React + TypeScript application.
2. Supabase remains the candidate system of record for InfiniteX workflow persistence, authentication, RLS, and transactional workflow state, subject to recovery of the canonical migration chain and successful disposable-local integration tests.
3. IQ Core remains a separately versioned Python orchestration capability. Reuse its governed workflow, permission, policy, approval, event, and agent abstractions only through a narrow authenticated backend API after its dependency PR stack and tests are verified.
4. The browser never receives service-role credentials, provider secrets, direct privileged RPC access, or authority to choose privileged agent/action/policy parameters.
5. A backend adapter owns authentication-to-principal mapping, tenant scoping, workflow catalog selection, idempotency, authorization, audit, and provider invocation.
6. Production release remains blocked until every required gate in Section 11 passes.

This is a target architecture, not a claim that the integrations currently exist.

## 2. Evidence baseline

### InfiniteX repository

- Default branch package manifest identifies a private Vite application using React 18, TypeScript 5.6, Vite 5.4, and Lucide React.
- The checked package manifest does not declare `@supabase/supabase-js`.
- Existing project history described task data as demo/static and backend integration as unverified.
- PR #35 (transactional workflow step fencing) is OPEN, DRAFT, UNMERGED. Its mutation test is intentionally local-loopback-only. The migration has not been applied to production; database concurrency tests have not been run.
- Canonical Supabase setup files previously sought (`supabase/config.toml`, `supabase/seed.sql`, and baseline migration `20261103134302_ashaa_backend_credit_ledger.sql`) were not found in the inspected InfiniteX branches. Their absence must be rechecked before any local stack work.

### IQ Core repository

Related draft PRs discovered:

- PR #156 Phase 13.49 — backend/frontend/IQ Core integration. It is stacked on PR #155 / Phase 13.48. It describes authenticated workflow routes and a trusted workflow template adapter. It explicitly reports tests, compile, browser, exact-head CI, live identity, durable policy/approval, PostgreSQL/RLS, and production readiness as NOT VERIFIED or NOT READY.
- PR #163 Phase 13.56 — runtime hardening. It describes defensive snapshots, event subscriber failure isolation, and removal of an implicit demo research handler. Runtime remains in-memory and synchronous; tests were authored but NOT RUN.
- PR #164 Phase 13.57 — reference blueprint alignment and acceptance tests. Tests were authored but NOT RUN.
- PR #342 Phase 13.218 — test-discovery repair. Source readback was reported; Python syntax/test execution and exact-head CI remain NOT RUN / NOT VERIFIED.

PR #156's test fixture uses an injected lambda returning a deterministic accepted/echo result. This is a test stub, not evidence of a real model/provider integration. The PR's own dependency chain must be preserved; do not cherry-pick its dependent files in isolation.

## 3. Non-goals

- No rewrite of InfiniteX into Python or Next.js.
- No duplicate IQ Core engine, agent registry, permission engine, policy engine, approval engine, or workflow engine in TypeScript.
- No replacement of the existing Supabase workflow runtime by a second competing database backend without an explicit architecture decision.
- No automatic execution of arbitrary code, arbitrary user-supplied tools, or unrestricted agent actions.
- No claim that an LLM, agent, provider, memory, or background worker is operational until configured and tested.
- No production deployment, migration, paid upgrade, or secrets modification.

## 4. System context and trust boundaries

```text
[Mobile/Desktop Browser]
        |
        | HTTPS; public application config only
        v
[InfiniteX React + TypeScript UI]
        |
        | authenticated user session; narrow API requests
        v
[Trusted API / Backend Adapter]
        |                 |
        |                 +--> [IQ Core Python service]
        |                       governed workflow catalog
        |                       permission/policy/approval gates
        |                       provider adapters (explicit injection)
        |
        +--> [Supabase]
              Auth identity mapping
              tenant-owned application data
              workflow/run/step persistence
              RLS and transactional RPC
              audit/event records
```

Trust boundaries:

- Browser input is untrusted, including IDs, tenant hints, action names, workflow names, model names, URLs, and approval identifiers.
- Identity and tenant scope are derived from verified server-side auth context, never trusted from JSON payload.
- Supabase service-role credentials remain server-only.
- IQ Core receives a normalized, authenticated principal and a server-selected workflow template; it must not trust a browser-supplied principal, permission, agent, action, or policy context.
- Provider credentials remain in server-side secret storage; never in Vite `VITE_*` variables.
- Event payloads and logs are data, not executable instructions. Redact secrets and sensitive user content.

## 5. Backend strategy and alternatives

### Option A — Supabase-first (recommended for current InfiniteX continuity)

Use Supabase Auth, Postgres/RLS, and the existing workflow tables/RPC as the canonical persistence and workflow state layer. Add a narrow Edge Function or trusted API adapter only after the migration chain, deployed worker source, RPC grants, and RLS contracts are reconciled.

Advantages:
- Preserves the existing Ashaa-INX workflow runtime and prior work.
- Fits the React/Vite frontend and PostgreSQL persistence model.
- Avoids introducing a second competing database and migration system.

Risks / blockers:
- Canonical migrations and local Supabase configuration are incomplete in the inspected InfiniteX branches.
- Live deployed worker source differs from PR candidates.
- PR #35 migration and concurrency semantics remain untested against a disposable local Supabase stack.
- Supabase dev branch cost is not assumed to be free; do not provision paid resources.

### Option B — IQ Core Python API as orchestration service

Run IQ Core behind a trusted API boundary, with the existing Supabase workflow state layer remaining authoritative. IQ Core handles governed orchestration, but durable state and idempotency are owned by the backend/database.

Advantages:
- Reuses the existing Python governance/orchestration work.
- Keeps the TypeScript frontend thin.
- Supports explicit capability injection and fail-closed workflow catalog.

Risks / blockers:
- IQ Core PR dependency chain is open and draft.
- Existing governance and approvals may be in-memory.
- Authentication provider, durable approval/reviewer identity, tenant-isolated PostgreSQL, provider routing, sandboxing, and distributed execution are not verified.
- A networked service adds deployment, authentication, retry, timeout, and observability responsibilities.

### Option C — TypeScript-native duplicate orchestration

Not recommended. It duplicates IQ Core logic, creates policy drift, and increases audit burden. Only implement a TypeScript adapter/client and UI state model, not a second policy/agent engine.

### Decision rule

Keep Option A as the data/workflow persistence direction. Adopt Option B only as an independently deployable orchestration adapter after its API security and dependency chain pass. If that service cannot be operated within the free budget, defer agent execution and ship a useful non-agent InfiniteX application first. Do not create two sources of truth.

## 6. Proposed API contracts

All routes are illustrative contracts and must be reconciled with the actual chosen backend before implementation.

### GET /api/v1/me

Returns authenticated principal metadata safe for the UI:
- subject identifier (opaque)
- tenant identifier (opaque, only if appropriate for client display)
- capability flags derived server-side

Never return roles or policy internals as an authorization substitute.

### GET /api/v1/workflows

Returns only workflows visible to the authenticated principal:
- workflow_id
- display_name
- description
- status/capability metadata

### POST /api/v1/workflows/{workflow_id}/runs

Request:
- client_request_id (UUID, idempotency key)
- input (validated JSON object)
- optional approved_request_reference, if supported by the durable approval design

The server selects the workflow definition, agent, action, permissions, and policy. The browser cannot override them.

Response:
- run_id
- status
- created_at
- status_url

Repeated idempotency key for the same principal and request must return the existing run or a deterministic conflict, never start duplicate work.

### GET /api/v1/runs/{run_id}

Returns a tenant-scoped run projection:
- run_id, workflow_id, status, created_at, updated_at
- safe step summaries
- user-visible error code and correlation_id

Do not expose raw provider prompts, hidden reasoning, secrets, stack traces, or unrestricted agent outputs.

### GET /health and readiness

Keep liveness and readiness distinct:
- liveness means the process responds.
- readiness requires explicitly checked dependencies.
- never report READY when database, auth, queue, or required provider dependencies were not checked.

## 7. Domain model and persistence ownership

Canonical persistent entities (subject to actual migration recovery):
- profiles / tenant membership / application roles
- workflows (server-owned definitions or references)
- workflow_steps
- workflow_runs
- workflow_step_runs
- workflow_logs / audit events
- idempotency records (new only after schema review)
- approval requests and decisions (only with durable authenticated reviewer identity)

Required invariants:
1. Every tenant-owned row has an enforceable tenant/owner relationship.
2. RLS is enabled and policies are tested for SELECT, INSERT, UPDATE, DELETE as appropriate.
3. Privileged worker writes use narrowly granted server-side RPC or service-role operations.
4. Run/step ownership and workflow membership are validated inside the transaction.
5. Attempt generation fences stale workers.
6. Idempotency constraints prevent duplicate submissions.
7. Every state transition has an allowed-from/allowed-to rule.
8. Audit records are append-only to application roles where feasible.
9. Retry and recovery behavior is bounded and observable.
10. No migration is applied until the complete ordered migration chain is recovered and tested from an empty disposable database.

## 8. IQ Core integration contract

Treat IQ Core as a governed orchestration library/service, not as an autonomous privileged actor.

Required adapter properties:
- Authentication principal is created by a trusted authenticator.
- Workflow catalog is server-registered and immutable for the duration of a run.
- Agent name, permission, action, objective, policy context, and provider are pinned by server configuration.
- Client input is treated as business data only.
- Every step passes permission, policy, and approval checks.
- Missing handler/provider/approval service returns BLOCKED or NOT_CONFIGURED; never simulate success.
- Test/demo handlers are isolated to tests and cannot be loaded by production configuration.
- Event delivery failure is observable and does not silently rewrite the authoritative workflow state.
- Task/event payloads are defensively copied and bounded.
- Timeouts, retries, cancellation, and idempotency are explicit.
- Cross-service requests carry correlation_id and idempotency key.
- No arbitrary shell, filesystem, network, SQL, or code-execution tool is exposed to agents by default.

Before integration, reconcile the IQ Core PR dependency stack, including Phase 13.48/13.49 and later hardening/acceptance PRs. Do not cherry-pick PR #156 without its base PR #155 and required ancestors.

## 9. Frontend architecture

Suggested structure (adapt to existing tree; do not create duplicate entry points):

```text
src/
  app/
    App.tsx
    routes/
    providers/
  features/
    auth/
    dashboard/
    workflows/
    runs/
    settings/
  components/
    layout/
    feedback/
    data-display/
  lib/
    api/
      client.ts
      contracts.ts
      errors.ts
    auth/
    validation/
  hooks/
  styles/
  types/
tests/
  unit/
  integration/
  e2e/
```

Frontend rules:
- Mobile-first responsive layout; accessible keyboard and screen-reader semantics.
- Explicit loading, empty, error, offline, permission-denied, and not-configured states.
- No optimistic success for workflow execution; display server-confirmed state.
- Abort stale requests and avoid race-prone state updates.
- Validate all API responses at runtime (e.g. Zod only if dependency approval and bundle impact are justified; otherwise use a small typed validator).
- Use a single API client with normalized base URL, timeout, cancellation, correlation ID, and typed error mapping.
- Keep secrets out of browser storage and build-time public variables.
- Demo mode must be visibly labeled and must never look like production data.

## 10. Reliability, security, and observability

- Authentication: verify issuer, audience, signature, expiry, and session revocation using a supported provider.
- Authorization: deny by default; enforce on every server request and in database RLS.
- Tenant isolation: test cross-tenant reads and writes, including guessed UUIDs.
- Input: schema validation, body-size limits, safe URL handling, allowlists, and bounded strings/arrays.
- Web security: CSRF strategy where cookie auth is used, strict CORS allowlist, secure headers, CSP, rate limits.
- Secrets: server-only, least privilege, rotation plan; never print or fetch secret values into logs.
- AI safety: server-side tool allowlists, per-tool authorization, output validation, prompt-injection-resistant data handling, spend/time budgets, human approval for consequential actions.
- Reliability: bounded retries with jitter, timeouts, idempotency, dead-letter/recovery strategy, cancellation semantics, and stale worker fencing.
- Observability: structured logs with correlation_id, run_id, tenant-safe identifiers; metrics for latency, failure, queue age, retries, and provider usage. Redact tokens and sensitive payloads.
- Supply chain: lockfile, pinned CI actions, dependency review, secret scanning, static analysis, and license checks.

## 11. PLAN → BUILD → TEST → AUDIT → RELEASE gates

### PLAN — BLOCKED until evidence is complete
- [ ] Recover canonical Supabase migrations, config, seed, and migration order from authoritative history.
- [ ] Produce schema inventory and dependency graph.
- [ ] Decide whether IQ Core runs as a separate service or remains deferred.
- [ ] Approve API and data ownership contracts.
- [ ] Confirm free-tier cost envelope without enabling paid services.

### BUILD — only after PLAN approval
- [ ] Implement API contract types and adapter boundary.
- [ ] Implement auth/session integration with server-derived principal.
- [ ] Implement tenant-safe persistence and server-owned workflow catalog.
- [ ] Integrate IQ Core only through the reviewed authenticated adapter.
- [ ] Build mobile-first UI states and accessible interactions.

### TEST — evidence required
- [ ] TypeScript lint/typecheck and production build.
- [ ] Python compile and unit tests for IQ Core exact head.
- [ ] API contract and auth tests.
- [ ] RLS matrix tests for owner, same-tenant peer, cross-tenant user, anonymous, and service role.
- [ ] Local migration-from-empty test.
- [ ] Two independent database sessions for duplicate start, stale completion, recovery, rollback, and lock interaction.
- [ ] Browser E2E for login, workflow listing, run submission, polling, cancellation, errors, and mobile layout.
- [ ] Failure injection for provider timeout, missing handler, event failure, and database unavailability.

### AUDIT — security and operational review
- [ ] Verify no privileged secrets in frontend bundle or repository.
- [ ] Verify CORS, CSP, CSRF, rate limits, RLS, grants, and RPC exposure.
- [ ] Review data retention, audit immutability, export/deletion requirements, and privacy.
- [ ] Verify observability and alerting without logging sensitive payloads.
- [ ] Reconcile source code, deployed worker source, migrations, and runtime configuration.

### RELEASE — explicit human approval required
- [ ] Exact commit SHA and CI checks recorded.
- [ ] Rollback and recovery plan rehearsed.
- [ ] Database backup and migration rollback/forward-fix strategy confirmed.
- [ ] Deployment environment and domain reviewed.
- [ ] Cost and quota reviewed.
- [ ] Human release approval recorded.
- [ ] Gradual rollout and post-release smoke test defined.

No release gate is implicitly approved by this document.

## 12. Immediate next work items

1. Recover and validate the canonical Supabase migration chain; search related repositories/branches and confirm provenance.
2. Audit PR #35 migration and worker changes against the full live schema and every writer/recovery path.
3. Inspect the complete IQ Core dependency stack for PR #156 and the later hardening/acceptance branches; record exact base/head relationships.
4. Run IQ Core Python tests on the exact candidate head when a functioning CI/local runner is available; no pass claims before execution.
5. Build a disposable local Supabase environment only after configuration and migration history are complete.
6. Create a frontend API contract adapter without adding Supabase dependencies prematurely.
7. Decide IQ Core service deployment only after a free-tier and security feasibility review.
8. Keep PRs draft until exact-head CI, integration, security, and dependency checks pass.

## 13. Decision record

- InfiniteX frontend: Vite + React + TypeScript remains canonical.
- Workflow persistence: Supabase remains the preferred direction, pending migration provenance and local test proof.
- IQ Core: reuse existing Python modules; do not port or duplicate its engines prematurely.
- Integration: authenticated, narrow API boundary; no direct privileged browser access.
- Production: NOT READY / RELEASE BLOCKED.
- This RFC: architecture proposal only; implementation approval required.

## 14. Evidence and uncertainty labels

- VERIFIED IN SOURCE: content was fetched from the referenced repository/branch.
- AUTHORED: tests or code exist but were not executed.
- NOT RUN: no execution evidence.
- NOT VERIFIED: no reliable evidence of the claimed runtime behavior.
- BLOCKED: prerequisite is missing.
- PRODUCTION NOT READY: required release gates have not passed.

A successful GitHub write or source readback is not equivalent to a passing test, secure runtime, production deployment, or user acceptance.
