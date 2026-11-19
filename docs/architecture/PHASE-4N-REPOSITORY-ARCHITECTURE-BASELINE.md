# Phase 4N — Repository Architecture Baseline and Implementation Manifest

**Status:** READ-ONLY SOURCE AUDIT COMPLETE FOR THE INSPECTED BRANCH TREE; RUNTIME, LIVE DATABASE, AND PRODUCTION INTEGRATION NOT VERIFIED  
**Inspected base:** `ci/phase-4m5c-security-regression-coverage` at `f8317c9c0c7074f2ccc7d9c08b82146ec82a06ef`  
**Audit scope:** Repository tree, selected source files, package scripts, API foundation, AI modules, Supabase Edge Function source, and architecture/security documents.  
**Change boundary:** Documentation only. No application source, workflow, database, secret, or deployment changes.

## 1. Executive finding

InfiniteX has three distinct implementation layers in this branch:

1. A React + TypeScript + Vite dashboard that explicitly presents sample/demo data.
2. A standalone Node.js API foundation with useful security/authentication/authorization primitives, but no production authentication, database connection, or protected application routes.
3. Supabase Edge Function source for workflow processing and API-key management, using Supabase Auth and privileged service-role clients.

There are also provider-neutral AI registry, policy, and orchestration modules. The repository contains substantial engineering foundations, but the inspected source does not establish that the frontend, Node API, Supabase functions, database schema, and AI execution path form one end-to-end production system.

**Strategic decision:** Do not rewrite the repository or merge unrelated branches wholesale. Preserve the working demo and CI baseline. Establish one canonical backend/data contract, reconcile the existing Supabase function path with the Node API foundation, then implement the smallest vertical slice end to end.

## 2. Repository evidence

### 2.1 Frontend

Observed files:
- `src/App.tsx`
- `src/components/*`
- `src/hooks/useTheme.ts`
- `src/styles/global.css`
- `src/types.ts`
- `src/lib/dashboard-data.mjs`
- `src/lib/api-client.mjs`

Evidence:
- The overview explicitly labels the workspace as a demo and its records as sample data.
- Metrics show “Unavailable” and explain that no connected data source or verified health probe exists.
- Agent, pipeline, and log screens explicitly identify sample/example data.
- Preview buttons explicitly state that no pipeline or job was started.
- The security screen says it is a frontend display only and backend security has not been verified.
- `src/lib/api-client.mjs` exists as a defensive browser transport abstraction, but the inspected `src/App.tsx` does not import or use it.
- `src/lib/dashboard-data.mjs` provides local agent filtering; it is not a persistence layer.

**Conclusion:** Frontend is a demo/preview interface, not evidence of a live connected workspace.

### 2.2 Root toolchain

Observed root package:
- React 18, React DOM 18, TypeScript, Vite, Lucide React.
- Scripts include `build`, `lint`, `test`, `test:e2e`, CI policy checks, browser-boundary checks, and Edge Function security checks.
- Root tests use Node's built-in test runner; browser tests use Playwright and axe.

CI evidence supplied by the current GitHub workflow runs is recorded separately. It does not prove live database, authentication, or provider integration.

### 2.3 Standalone Node API

Observed files:
- `apps/api/src/app.mjs`
- `apps/api/src/server.mjs`
- `apps/api/src/config.mjs`
- `apps/api/src/auth/*`
- `apps/api/src/authorization/*`
- `apps/api/test/*`

The package declares Node.js >=22 and no third-party runtime dependencies.

Current HTTP behavior in source:
- `GET /healthz`: process liveness.
- `GET /readyz`: deliberately returns 503 while required dependencies remain disabled.
- `GET /api/v1/status`: reports authentication, workspace authorization, database, and AI execution as not configured/disabled.
- Other paths: 404.
- Non-GET methods: 405.

The package README explicitly says this is a read-only runtime foundation, not a production-authenticated backend. Authentication/session and workspace authorization helpers are isolated primitives and are not wired into protected HTTP routes. The PostgreSQL adapters use injected clients and assume `auth_sessions` and `workspace_memberships` contracts; this source does not provision or connect a database.

**Conclusion:** Do not expose this Node API as the production application API yet.

### 2.4 Authentication and workspace authorization primitives

Observed source includes:
- Opaque session token generation and hashing.
- CSRF token hashing/verification helpers.
- Secure cookie policy helpers.
- Repository-injected session lifecycle.
- Parameterized PostgreSQL session adapter.
- Fail-closed principal/middleware helpers.
- Deny-by-default workspace role policy.
- Transactional PostgreSQL membership role-change adapter with active membership row locks and last-owner protection.

Limitations documented in source:
- No live PostgreSQL pool or credentials.
- No verified provisioned schema or migration.
- No production identity-provider wiring.
- No complete login/logout/rotation route integration.
- No end-to-end authorization or RLS proof.

### 2.5 Supabase Edge Functions

Observed source:
- `supabase/functions/simula-workflow-worker/index.ts`
- `supabase/functions/simula-workflow-cron-worker/index.ts`
- `supabase/functions/ashaa-api-key-manager/index.ts`
- Shared CORS and worker-security helpers.

Source-level observations:
- The regular workflow worker validates a bearer token with `auth.getUser(token)`, derives the owner ID from the verified user, claims runs through a user-scoped RPC, checks claimed-run ownership, validates workflow ownership before processing, and scopes step-run reads/writes by owner ID.
- The cron worker validates a dedicated worker secret through a database RPC before using the service-role client to claim and process queued runs; it validates the workflow against the claimed run's owner.
- The API-key manager validates the bearer token, derives ownership from the verified user, scopes list/revoke operations by owner, stores a SHA-256 digest, and returns a newly created raw key once.

Important limitations:
- Source inspection does not prove the deployed Edge Function configuration, current database RPC definitions, grants, secrets, or production runtime behavior.
- Service-role use makes database ownership checks and RPC privilege boundaries critical.
- The worker and cron worker contain similar workflow action implementations; this creates a code-parity and regression risk if one changes without the other.
- The inspected recursive Git tree contains no tracked SQL migration/schema files. That is a repository finding, not proof that the remote Supabase project has no schema.

### 2.6 AI orchestration

Observed source:
- `src/lib/ai/agent-registry.mjs`
- `src/lib/ai/policy.mjs`
- `src/lib/ai/orchestrator.mjs`
- AI orchestration tests.

The modules provide:
- Agent registration and input normalization.
- Provider allowlists and bounded input/output/step/cost policies.
- Deny-by-default tool risk policy and approval callback.
- Provider-neutral, single-step orchestration with timeout/cancellation handling and bounded in-memory audit events.

Limitations:
- No provider is enabled by default.
- No provider credentials are configured in these modules.
- The orchestrator comment requires a trusted server runtime; the current dashboard must not import privileged provider/tool execution into the browser.
- In-memory audit events are not durable audit storage.
- The orchestrator is not shown wired into the standalone API or Supabase worker execution path.

**Conclusion:** This is a useful AI execution foundation, not a live AI-agent platform.

## 3. Documentation consistency finding

The inspected `docs/security/PHASE-3D-4F-DATABASE-SECURITY-RLS-AUDIT-DESIGN.md` states that the inspected branch has no `supabase/` directory. The current recursive tree does contain `supabase/functions/`.

The document's separate statement that no tracked SQL files/migrations were found is consistent with the inspected tree. The “no Supabase directory” statement is stale or refers to a different candidate snapshot.

Required correction in a later documentation-only change:
- Record the exact branch and commit SHA for each inventory.
- Distinguish Supabase Edge Function source from database schema/migration source.
- Do not infer remote project state from a repository tree.
- Preserve historical audit findings with their original snapshot labels rather than silently rewriting history.

## 4. Critical risks and priorities

| Priority | Finding | Required response |
|---|---|---|
| P0 | Frontend is demo-only; backend is not wired end to end | Keep demo labels; define and test one vertical slice before calling it live |
| P0 | Node API has no production auth, DB, or protected routes | Keep readiness blocked; do not expose as production API |
| P0 | Supabase service-role functions depend on database RPC/schema/grants not proven by this source audit | Read-only verify deployed function settings, RPC definitions, grants, RLS and schema before changes |
| P0 | No tracked SQL migration/schema contract in inspected branch | Obtain a read-only schema snapshot; do not invent table names or apply migrations from adapter assumptions |
| P1 | Node API and Supabase Edge Functions are separate backend paths | Select a canonical request/identity/data path; avoid duplicating business logic |
| P1 | Workflow and cron workers duplicate action execution logic | Extract a shared, tested pure action module only after behavior parity is captured |
| P1 | AI orchestration is not wired to authenticated server routes and durable audit | Keep providers/tools disabled until identity, policy, quotas, approval and audit are end-to-end |
| P1 | Architecture documentation contains stale branch inventory | Update docs with commit-scoped evidence |
| P2 | Browser API client is not connected to the dashboard | Integrate only after API contract, auth and error/loading states are approved |
| P2 | Mobile UX and real device behavior are not verified by source inspection | Run Android viewport and device QA after functional integration |

## 5. Recommended target architecture

**Preferred near-term option: Supabase-centered modular backend, with a thin frontend API boundary.**

Rationale:
- The repository already contains Supabase Edge Function source that validates Supabase identities and uses owner-scoped operations.
- PostgreSQL and Supabase Auth can provide the identity/data foundation without immediately operating a second public Node API.
- It avoids building two competing authentication/session systems.
- It is compatible with a free-first approach subject to actual project quotas and service limits.

Target logical flow:

```text
React + TypeScript + Vite
  ├── Pages and accessible UI
  ├── Query/mutation layer
  ├── Runtime-validated API contracts
  └── Explicit demo/live capability states
             |
             | HTTPS; user access token
             v
Supabase Edge Functions (trusted server boundary)
  ├── Auth validation
  ├── Workspace membership and authorization
  ├── Workflow/task application services
  ├── AI provider adapters (disabled until approved)
  ├── Quota and approval policy
  └── Durable audit events
             |
             | least-privilege server-side access
             v
PostgreSQL
  ├── Canonical identity/workspace schema
  ├── Constraints and indexes
  ├── RLS on tenant-owned data
  └── Transactional audit and workflow state
```

The Node API foundation should remain isolated until there is a concrete need for a separately hosted API runtime. If selected later, it must become the single canonical backend and the overlapping Supabase business logic must be deliberately retired or reduced to adapters—not run as two independent sources of truth.

## 6. Implementation manifest — proposed, not yet implemented

### Phase 4N.1 — Schema and runtime truth (read-only)
- Inspect actual Supabase project identity and deployed function configuration.
- Inspect deployed RPC definitions, execute grants, RLS state/policies, table columns, constraints and indexes using read-only access.
- Compare actual database contracts with `auth_sessions`, `workspace_memberships`, workflow and API-key source assumptions.
- Record evidence, timestamp, project reference and exact branch SHA.
- Exit: a reviewed schema map with no speculative migration SQL.

### Phase 4N.2 — Backend contract
- Define canonical user/workspace/task/agent/workflow contracts.
- Add runtime validation at every untrusted HTTP boundary.
- Define standard error envelope, request ID, pagination, timeout and idempotency rules.
- Define one canonical auth and authorization path.
- Exit: contract tests and an approved API manifest.

### Phase 4N.3 — Secure vertical slice
- Implement read-only authenticated workspace status first.
- Derive user identity from verified auth, never request JSON.
- Resolve active workspace membership server-side.
- Enforce tenant scope in every query and database policy.
- Add durable audit for security-sensitive access.
- Exit: cross-tenant negative tests pass using synthetic identities.

### Phase 4N.4 — First mutation workflow
- Add one low-risk workflow/task creation path.
- Validate input, ownership, state transition, rate/quota, and idempotency.
- Require explicit approval for external/destructive actions.
- Use transactionally consistent audit records.
- Exit: success, denial, retry, duplicate-request, timeout and rollback tests pass.

### Phase 4N.5 — AI execution
- Connect one provider adapter behind a server-only interface.
- Keep provider credentials server-side.
- Enforce model allowlists, output bounds, budget caps, per-user quotas and timeouts.
- Treat model output and retrieved content as untrusted input.
- No arbitrary code execution or unrestricted tool access.
- Exit: evaluation tests, prompt-injection boundary tests, approval tests and cost controls pass.

### Phase 4N.6 — Frontend integration and polish
- Replace one demo panel at a time with verified API data.
- Preserve explicit Sample / Connected / Stale / Error states.
- Add loading, empty, retry, permission-denied and offline states.
- Keep mobile-first navigation and accessible keyboard/focus behavior.
- Exit: Playwright + axe, Android viewport QA and real API contract tests pass.

### Phase 4N.7 — Release readiness
- Re-run all CI on the exact release candidate SHA.
- Review dependencies, secrets, RLS, RPC grants, function configuration and logs.
- Confirm backup/restore and rollback procedure.
- Verify deployment health and quota limits.
- Obtain explicit human release approval.
- Exit: no unresolved P0 findings and release evidence is attached.

## 7. Free-first engineering choices

- Keep existing React, TypeScript, Vite, Node test runner and Playwright where they fit.
- Prefer built-in Node APIs and existing dependencies over adding frameworks without demonstrated need.
- Use Supabase free-tier resources only after confirming actual quotas and project limits.
- Use GitHub Actions for reproducible CI; do not use repeated Vercel deployment attempts as a substitute for tests.
- Use synthetic identities and a disposable database for integration tests.
- Do not put production secrets in browser bundles, Git history, sample data, test fixtures or CI logs.
- A free tier is quota-limited, not unlimited; record storage, egress, function invocation and build limits before selecting a production path.

## 8. Verification ledger

| Capability | Status from this audit |
|---|---|
| Frontend dashboard source | VERIFIED as a demo/sample UI |
| Browser API client source | VERIFIED as source; not wired into inspected App |
| Node API foundation | VERIFIED as source; production auth/database disabled |
| Auth/session primitives | VERIFIED as isolated source; not production-integrated |
| Workspace authorization adapter | VERIFIED as source; schema/runtime not provisioned by this repository |
| Supabase Edge Function source | VERIFIED as source; deployed configuration/runtime not checked |
| AI registry/policy/orchestrator | VERIFIED as source; no enabled provider or end-to-end route verified |
| SQL migrations/schema in inspected branch tree | NOT FOUND |
| Live Supabase schema/RLS/RPC grants | NOT VERIFIED in this source-only audit |
| Frontend-to-backend end-to-end flow | NOT VERIFIED |
| Android physical-device QA | NOT TESTED |
| Production readiness | BLOCKED |

## 9. Change and release boundaries

This audit creates no authorization to:
- apply or roll back database migrations;
- read or modify production secrets;
- change Supabase function settings or deploy functions;
- merge pull requests;
- deploy or publish the application;
- enable paid plans or incur new service costs;
- delete or rewrite existing project data.

All such operations require a separate plan, evidence, and explicit approval.

## 10. Next recommended engineering action

Complete Phase 4N.1 with read-only Supabase schema/RLS/RPC verification. Only after the canonical data model is proven should the implementation manifest be converted into migration proposals or application code.
