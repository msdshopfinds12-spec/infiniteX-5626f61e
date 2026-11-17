# Phase 4M.2 — Trusted Backend Architecture Audit

**Status:** Planning / read-only audit  
**Audit ref:** `fix/phase-4m1b-browser-boundary`  
**Scope:** Repository source and tests only. No live Supabase project, database, secrets, deployment, or billing settings were accessed or changed.

## Executive decision

InfiniteX has useful security primitives, but the API currently runs in foundation mode. Authentication, database access, and AI providers are explicitly disabled. The current HTTP application exposes health, readiness, and status endpoints and rejects non-GET methods. The presence of session and authorization modules is not evidence that protected API routes are active.

**Do not enable authentication or database flags yet.** First select and verify the identity source, define the schema contract, connect authentication at the HTTP boundary, enforce workspace membership on every protected route, and test tenant isolation.

## Evidence matrix

| Area | Status | Repository evidence | Consequence |
|---|---|---|---|
| HTTP API boundary | VERIFIED (foundation only) | `apps/api/src/app.mjs` | Health/status endpoints exist; no protected resource routes observed |
| Server limits | VERIFIED | `apps/api/src/server.mjs` | Header/request/keep-alive limits and graceful shutdown are configured |
| Runtime config | VERIFIED | `apps/api/src/config.mjs` | Authentication, database, and AI provider flags are hard-disabled |
| Session token design | PARTIAL | `apps/api/src/auth/session-service.mjs`, `opaque-token.mjs` | Opaque token hashing, expiry and revocation logic exist |
| Cookie and CSRF primitives | PARTIAL | `cookie-policy.mjs`, `csrf.mjs`, `middleware.mjs` | Secure cookie and mutation checks exist but are not wired into routes |
| PostgreSQL session adapter | PARTIAL | `postgres-session-repository.mjs` | Adapter assumes `auth_sessions`; schema/migration not found in audited ref |
| Workspace authorization policy | PARTIAL | `authorization/policy.mjs` | Role/permission checks exist as library functions |
| Membership repository | PARTIAL | `postgres-membership-repository.mjs` | Adapter assumes `workspace_memberships`; no route integration verified |
| Database schema / RLS | BLOCKED | No `supabase/` migration directory found in audited ref | Cannot safely enable database integration |
| Browser API client | PARTIAL | `src/lib/api-client.mjs` | Client currently uses `credentials: "omit"`; incompatible with cookie-session auth without a deliberate, tested change |
| Supabase client integration | NOT FOUND | No Supabase project config or client dependency found in audited ref | Supabase is a candidate, not a verified integration |
| AI provider integration | DISABLED | Runtime status/config and AI orchestration policy | Keep disabled until trusted backend boundary is complete |

## Critical findings

### 1. Session middleware is not mounted

`resolveRequestPrincipal()` is implemented in `apps/api/src/auth/middleware.mjs`, but `createApp()` in `apps/api/src/app.mjs` does not invoke it. No authenticated principal is currently established by the HTTP application.

### 2. Authorization is not applied to route handlers

`authorizeWorkspaceAction()` is a reusable policy function, not a route-level access control system. Each workspace route must resolve the authenticated principal, load the active membership from trusted storage, and enforce a permission before reading or mutating tenant data.

### 3. Browser credentials are deliberately omitted

The browser API client sets `credentials: "omit"`. If the backend adopts an HttpOnly cookie session, this must be deliberately revised to `same-origin` or `include` according to the final origin topology, with exact CORS allowlists, CSRF checks, and browser integration tests. Do not simply enable credentials globally.

### 4. Database schema is not established

The PostgreSQL adapters expect `auth_sessions` and `workspace_memberships`. No corresponding migration/schema directory was found in the audited branch. RLS coverage, constraints, indexes, grants, and tenant-scoped foreign keys therefore remain unverified.

### 5. The current tests validate primitives, not end-to-end trust boundaries

Unit tests cover session helpers, policy decisions, SQL parameterization, and the foundation HTTP API. They do not prove that a real HTTP request is authenticated, that a workspace route rejects cross-tenant access, or that database RLS blocks direct Data API access.

## Recommended target architecture

```text
React / TypeScript browser
  |
  | HTTPS + same-origin session cookie (only after approved design)
  v
API edge: origin allowlist, request limits, security headers
  |
  v
Authentication boundary: resolve trusted identity/session
  |
  v
CSRF boundary for mutations + request schema validation
  |
  v
Workspace authorization: active membership + permission
  |
  v
Application service: business rules, idempotency, audit events
  |
  v
Repository: parameterized SQL + tenant-scoped predicates
  |
  v
PostgreSQL: constraints + RLS as defense in depth
```

The browser must never provide its own trusted `userId`, role, workspace membership, provider credentials, or authorization claims. Derive identity from a verified server-side session or verified identity token. Derive permissions from trusted server-side membership records.

## Provider decision: Supabase candidate, not activated

The existing Supabase project may be the preferred free-first candidate for managed identity and PostgreSQL, but repository evidence alone cannot verify its current configuration, schema, RLS, Auth providers, quotas, or project health.

Before implementation, perform a separate **read-only project configuration audit** and confirm:
- Auth providers and redirect URL configuration
- Whether the project is paused/active and current plan/quota constraints
- Existing tables, constraints, indexes, grants, and RLS policies
- Whether any existing production data or policies must be preserved
- Whether the project is actually the intended source of identity for InfiniteX

Never place a Supabase secret/service-role key in browser code or any `VITE_*` variable. A public publishable/anon key is not an authorization boundary; RLS must enforce row access. Do not authorize from user-editable metadata. Avoid `SECURITY DEFINER` unless a documented, reviewed exception is essential.

If Supabase is not suitable, alternatives are:
1. Existing custom session service + managed PostgreSQL, after establishing a trusted identity issuer.
2. Supabase Auth + PostgreSQL RLS, if the project audit confirms it is appropriate.
3. Cloudflare Workers + D1 only after a separate architecture/cost/consistency comparison.

Do not run two competing identity systems in parallel.

## Implementation sequence and acceptance gates

| Phase | Work | Acceptance criteria |
|---|---|---|
| 4M.2A | Read-only provider and schema audit | Identity source, database source, current state, and cost constraints documented |
| 4M.2B | Schema contract and migration design | ERD, ownership model, constraints, RLS matrix, rollback plan reviewed; no migration applied |
| 4M.2C | Authentication boundary | Every protected request resolves trusted identity; missing/expired/revoked sessions fail closed |
| 4M.2D | Workspace route authorization | Every route enforces active membership, workspace scope, and permission server-side |
| 4M.2E | Tenant isolation | RLS and repository predicates prevent cross-workspace reads/writes |
| 4M.2F | Security regression tests | Unauthenticated, cross-tenant, privilege-escalation, CSRF, replay, expiry, and revocation cases fail safely |
| 4M.2G | CI enforcement | Static checks, unit tests, integration tests, build, dependency audit, and browser tests run on PRs |
| 4M.2H | Security audit | Threat model, secrets scan, RLS review, error handling, logging, and readiness reviewed |

### Required negative tests

- No cookie, malformed cookie, expired session, revoked session, and repository outage.
- Authenticated user with no membership.
- User requests a different workspace ID.
- Viewer attempts a write.
- Member attempts to update another user's resource.
- Admin attempts owner-level actions.
- CSRF token missing, malformed, or mismatched.
- Session revocation takes effect on protected operations according to the chosen session model.
- Database direct access cannot bypass workspace isolation.
- AI tools cannot access a workspace unless the requesting principal is authorized for that exact workspace and action.

## CI and AI engineering policy

- CI remains least-privilege and read-only for repository checks wherever possible.
- Pin third-party Actions to immutable commit SHAs; use `npm ci` and the committed lockfile.
- Run static policy checks, TypeScript, unit tests, API integration tests, build, dependency audit, Playwright, and axe.
- Use deterministic mock providers in CI. No paid API calls or real user data in tests.
- AI agents may inspect, propose patches, generate tests, and explain diffs. They must not execute arbitrary generated shell/code, access production secrets, bypass approval gates, merge PRs, deploy, or apply migrations.
- Every agent action should be scoped, logged, reviewable, and constrained by repository permissions.
- Mark each capability VERIFIED, PARTIAL, BLOCKED, or NOT TESTED. Never infer success from code presence alone.

## Change-control boundary

This audit is documentation-only. It does not authorize:
- Applying migrations or executing SQL against a connected project
- Enabling authentication/database/provider runtime flags
- Creating or rotating secrets
- Changing Supabase Auth or RLS configuration
- Connecting a paid provider or enabling billing
- Deploying, publishing, merging, or changing production data

Human review is required before each such operation.

## Audit limitations

This is a source-level review of the named branch and files. It is not a live penetration test, database audit, Supabase dashboard inspection, production traffic review, or proof of deployment behavior. Findings must be revalidated against the final integration branch before release.


---

## Live Supabase audit addendum — 2026-11-18

**Audit status:** READ-ONLY inspection completed. Project settings, schema, migrations, policies, advisor findings, and Edge Function source were inspected. No database writes, migrations, function deployments, secret reads, or configuration changes were performed.

### Project and schema evidence

| Check | Observed result | Status |
|---|---|---|
| Project | `Ashaa-INX` / `vepacoemkhudamfaccah` | VERIFIED |
| Project health | `ACTIVE_HEALTHY` | VERIFIED |
| Database | PostgreSQL 17 | VERIFIED |
| Recorded migrations | 18 | VERIFIED |
| Public application tables | 14 | VERIFIED |
| RLS | Enabled on all 14 listed public tables | VERIFIED |
| RLS policy coverage | 13 tables have one or more policies; one has none | VERIFIED |
| Active Edge Functions | 3 listed | VERIFIED |
| Frontend/API integration | Not tested by this project inspection | NOT TESTED |

The table inventory reported zero rows for the listed application tables at audit time. This is an observed inventory value, not proof that all project data or other schemas are empty.

### Live security finding — webhook event table

Supabase Security Advisor reported:

- `RLS Enabled No Policy`
- `public.billing_webhook_events`
- RLS is enabled, but no policy exists.

This table stores billing webhook event processing metadata. The safe default is to keep browser roles unable to read or mutate it and let a narrowly scoped trusted server-side webhook handler perform validated, idempotent writes. Do not add a broad authenticated policy merely to silence the advisor. Review table grants and the webhook handler before deciding whether the advisor notice is an intentional server-only design or a configuration defect.

Remediation reference: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

### Other live RLS observations

The read-only policy inventory found owner-scoped policies on profiles, user projects, usage logs, subscriptions, payments, API keys, credits, workflows, workflow runs, workflow steps, step runs, and workflow logs. These policy definitions are evidence of row filters, not proof of complete privilege safety. Table grants, function grants, write paths, and negative tests must also be reviewed.

### Worker and API-key function review

Three active Edge Functions were listed:

- `simula-workflow-cron-worker` — `verify_jwt=false`; source requires a dedicated worker-secret header and validates it through `simula_verify_worker_secret`. The secret value itself was not read.
- `simula-workflow-worker` — `verify_jwt=true`; source validates the bearer token with `auth.getUser()` before claiming user-owned runs.
- `ashaa-api-key-manager` — `verify_jwt=true`; source validates the user, scopes API key creation, stores a SHA-256 digest, and returns the raw key once.

The cron worker's secret verification and internal queue claim functions are SECURITY DEFINER with an empty search_path. Read-only ACL inspection showed the internal claim wrapper and secret verifier are executable by `service_role`, not `authenticated`. The user-facing claim function is executable by `authenticated` and scopes queue claims using `auth.uid()`.

**Follow-up hardening:** The regular workflow worker uses the service-role client for step reads. Add explicit `owner_id` scoping to those reads and verify the returned claimed run's owner matches the authenticated principal, even though the current claim RPC is owner-scoped. This is defense in depth around service-role access.

Both user-facing Edge Functions currently emit wildcard CORS origins. Authentication is still enforced in their source, but production browser use should use an explicit trusted-origin allowlist and test preflight behavior. Do not assume CORS is an authorization control.

### Performance Advisor

Six indexes were reported as unused at audit time. These are informational candidates only. Do not drop them without query workload evidence, foreign-key coverage review, and a measured before/after plan. An index may be useful for infrequent, future, or integrity-related operations despite a low usage counter.

Remediation reference: https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index

### Updated backend decision

Supabase is now **VERIFIED as an existing live project and schema**, not merely a candidate. Its suitability as InfiniteX's production identity/database source remains **PARTIAL / NOT APPROVED** until the repository integration, authentication model, CORS topology, webhook trust boundary, service-role access, and tenant-isolation tests are reconciled.

### Required next actions

1. Inspect table grants for `billing_webhook_events` and confirm browser roles cannot access it.
2. Review webhook verification/idempotency implementation without exposing signing secrets.
3. Add owner predicates to service-role workflow step reads and test cross-owner denial.
4. Restrict authenticated Edge Function CORS to approved frontend origins.
5. Add integration tests for RLS, RPC execute grants, webhook event isolation, API-key ownership, and worker tenant boundaries.
6. Reconcile repository schema/migrations with the 18 live migrations before proposing any new migration.

**Change-control:** This addendum is documentation-only. It does not authorize schema changes, policy changes, Edge Function redeployments, secret rotation, runtime flag changes, or production data changes.


---

## Live privilege and worker-source verification — 2026-11-18

### Webhook event table: browser access is not granted

A read-only privilege check confirmed:

| Role | SELECT | INSERT |
|---|---:|---:|
| `anon` | false | false |
| `authenticated` | false | false |
| `service_role` | true | true |

The table's RLS-enabled/no-policy advisor finding is therefore **not evidence of current direct browser access**. The observed grants support a server-only design. Keep it that way unless a reviewed use case proves otherwise. The advisor finding remains visible and should be documented as intentional only after the webhook writer and operational ownership are identified.

No active Edge Function named or visibly implementing a billing webhook receiver was found in the three-function inventory. Do not infer that webhook signature verification or idempotent ingestion is implemented merely because the event table exists.

### Worker source: important ownership asymmetry

The authenticated `simula-workflow-worker` does the following:

1. Validates the bearer token with `auth.getUser(token)`.
2. Claims runs through the user-scoped `simula_claim_workflow_runs` RPC.
3. Uses a service-role client for workflow-step reads and run/step writes.
4. Filters step-run reads and writes by `owner_id`.
5. Does **not** explicitly verify each returned claimed run's `owner_id` equals the authenticated user's ID before privileged processing.
6. Reads `workflow_steps` by `workflow_id` without first validating that the workflow row's `owner_id` matches the authenticated user.

The RPC is intended to enforce user scope, but service-role execution makes explicit post-claim ownership checks a valuable defense-in-depth control. Treat this as a high-priority source-level finding pending tests of the RPC and actual RLS/grant behavior.

The secret-authenticated cron worker differs: it verifies the worker secret, calls the internal claim RPC, and verifies the workflow row by both `workflow_id` and `owner_id` before reading steps. This is stronger explicit ownership validation in the inspected source. Its workflow-step query is still keyed by the globally unique `workflow_id`; keep the prior ownership check mandatory.

### API-key manager

The active `ashaa-api-key-manager` function validates the bearer token with `auth.getUser`, derives `owner_id` from the verified user, and scopes list/revoke operations by that owner. It stores a SHA-256 digest and returns the raw generated key once. Its wildcard CORS origin is a browser-origin hardening issue, not a replacement for authentication or ownership authorization.

### Revised priority list

1. **P0 before enabling user workflow execution:** validate every claimed run's owner against the authenticated principal; validate the parent workflow owner before any service-role step read; add cross-owner negative tests.
2. **P1:** replace wildcard CORS on the two user-facing functions with an exact allowlist based on verified production/staging frontend origins; test OPTIONS, allowed origins, disallowed origins, and non-browser requests.
3. **P1:** identify and inspect the actual billing webhook ingress outside the current three-function inventory; if none exists, keep billing event ingestion disabled until signature verification, replay protection, idempotency, and provider-event mapping are designed.
4. **P2:** document the no-browser-grant posture for `billing_webhook_events` and confirm operational service-role write ownership.
5. **P2:** add integration tests for API-key owner isolation, revoked/expired keys, workflow claim ownership, and worker retry/idempotency.

**No live changes were made.** This section records source and privilege observations only. Any remediation must be proposed as a separate reviewed implementation, with tests, and must not be applied directly to the live Supabase project.
