# InfiniteX Release Readiness and Critical-Path Execution Roadmap

**Status:** ACTIVE ENGINEERING PLAN — isolated candidate only  
**Reviewed:** 2026-11-21  
**Candidate branch:** `engineering/infinitex-canonical-integration-candidate`  
**Current pull request:** #102 (Draft)  
**Latest verified candidate commit before this document:** `c19984e22b4c737bfe973dc450cecc179c148614`

This roadmap defines the shortest safe path to a complete, supportable InfiniteX release. “100% complete” means every required product capability has an agreed acceptance test and evidence; it does not mean a dashboard looks finished or a build happens to pass.

## 0. Latest isolated progress — PR #103 (2026-11-21)

- PR #103 remains Draft and unmerged on `phase-71/worker-http-integration`; PR #102 remains untouched and Draft.
- Worker HTTP handlers are injectable and have Deno request/response integration tests, stateful mock workflow execution, retry/failure/ownership tests.
- Typed read-only workflow, workflow-run, and safe event-log services are connected to the authenticated Pipelines view. No browser-side workflow mutations or run creation are enabled; log `details` and run input/output are excluded from browser projections.
- Exact-head GitHub Actions run #44805498658 and disposable PostgreSQL 17 replay run #44805508557 passed on `060c0516f9d3d3964e1c292b8c856f026083f3c6`.
- Remaining: approved non-production browser query, two-user browser RLS verification, live schema/function reconciliation, mobile/accessibility QA, and release authorization.
- Vercel project-specific checks continue to show build-rate-limit blockers; no deployment was initiated.


## 1. Executive status

| Area | Evidence-backed status | Release consequence |
|---|---|---|
| Candidate build, lint, dependency audit | PASS on exact commit `c19984e` in GitHub Actions run #44790688190 | Candidate source compiles and its configured gates pass |
| Auth/session source | Present in candidate; fail-closed bootstrap and provider-neutral adapter are implemented | Must still pass real provider and browser E2E checks |
| Dashboard UI | Present; agents, pipelines, logs and metrics are explicitly sample/demo | Do not market or display as live operations |
| Workflow backend source | Edge worker and cron worker source files exist; queue claim and attempt-fencing paths are implemented | Source presence is not proof that deployed functions, RPCs, schema, secrets or schedules match |
| API-key management source | Edge function source and safe metadata projection tests exist | Verify real RLS, hashing, revoke semantics, rate limits and audit trail |
| Database schema | TypeScript database snapshot exists; genuine current schema metadata capture and independent parity review remain required | No migrations or production schema edits until the canonical schema is verified |
| Billing | Schema type declarations include billing-related tables; no verified provider integration, live prices or entitlement enforcement | No checkout, charge, price publication or billing configuration changes |
| Production deployment | Vercel checks are blocked by account build-rate limit | No deployment success claim |
| Release approval | PR #102 remains Draft and unmerged | Human approval remains mandatory |

## 2. Non-negotiable engineering gates

1. **INSPECT:** read the exact branch, commit, schema, secrets boundary and runtime configuration.
2. **PLAN:** publish contracts, threat model, state machines, migration plan and acceptance criteria.
3. **APPROVE:** obtain explicit approval for migrations, secrets, billing, merge, production changes and deployment.
4. **BUILD:** implement one vertical slice at a time behind typed service boundaries.
5. **TEST:** run unit, integration, adversarial, RLS isolation, browser and device tests.
6. **DEBUG:** reproduce failures, capture exact logs, fix root cause, add regression coverage.
7. **AUDIT:** review security, privacy, accessibility, performance, cost and operational recovery.
8. **RELEASE:** verify exact artifact and environment, obtain human approval, then deploy and smoke-test.

No phase can be marked complete solely because a plan or UI element exists.

## 3. Critical path

### Phase A — Establish canonical evidence

**Deliverables**
- Capture current Supabase schema metadata from the intended project using a metadata-only process.
- Record schema version, tables, columns, indexes, constraints, foreign keys, RLS policies, grants, functions, triggers and scheduled jobs.
- Compare the capture to `src/lib/supabase/database.types.ts` and all worker RPC/table references.
- Resolve every mismatch before generating migrations.

**Exit criteria**
- Independently reviewed schema parity report.
- No guessed table, column, RPC signature, policy or function definition.
- No production write performed.

**Blocker:** the genuine schemaVersion 2 metadata capture and independent review are still outstanding.

### Phase B — Verify backend execution contracts

**Existing source to inspect**
- `supabase/functions/simula-workflow-worker/index.ts`
- `supabase/functions/simula-workflow-cron-worker/index.ts`
- `supabase/functions/ashaa-api-key-manager/index.ts`
- `supabase/functions/_shared/worker-security.mjs`
- `src/features/workflows/workflow-run-request.ts`
- `src/features/security/api-key-metadata.ts`

**Required contracts**
- Authenticated user identity and tenant/owner resolution.
- Queue claim semantics, atomicity, lease expiry and retry behavior.
- Attempt/generation fencing for stale workers.
- Allowed action registry and strict input/output size limits.
- Per-step timeout, total execution budget and bounded concurrency.
- Idempotency for run creation, event logging and external side effects.
- Safe error taxonomy with no credential or sensitive payload leakage.
- API-key creation, one-way hashing, scope validation, expiry and revocation.
- CORS allowlist, origin behavior and worker-secret verification.

**Exit criteria**
- RPC signatures and database constraints match the verified schema.
- Two-user tests prove owner isolation for reads, claims, updates and logs.
- Race tests prove stale attempts cannot overwrite newer attempts.
- Worker tests cover malformed requests, oversized payloads, missing secrets, replay, timeout and partial failure.
- Real deployed-function invocation is verified in a non-production environment.

### Phase C — Type-safe application service layer

**Implementation direction**
- Add a provider-neutral service interface for workflows, agents, logs and usage.
- Implement Supabase adapters only after schema/RLS contracts are verified.
- Keep browser requests minimal; never accept client-supplied owner IDs, lifecycle status, billing status or trusted usage totals.
- Use discriminated result types and stable error codes.
- Add request cancellation, bounded retries only for safe/idempotent operations, and observable request IDs.
- Keep demo fixtures separate from live adapters and label each source state explicitly.

**Exit criteria**
- Components consume typed services, not inline database queries.
- Unconfigured or unavailable services fail closed or show a clearly labelled demo state.
- No demo records can be mistaken for live telemetry.
- Unit and integration tests cover success, empty, denied, timeout and unavailable states.

### Phase D — Product capabilities

Deliver in this order:

1. **Workspace and profile:** authenticated profile, workspace membership, role display and safe settings.
2. **Workflow CRUD:** list, create, edit, archive and validate workflows with owner enforcement.
3. **Workflow execution:** create run request, claim, execute allowlisted steps, retry safely, cancel where supported, and inspect terminal state.
4. **Logs:** owner-scoped, paginated run logs with safe structured metadata and retention controls.
5. **Agent registry:** capability manifest, version, enabled state, owner and execution policy. Do not claim autonomous agent behavior until a real runtime exists.
6. **Usage and entitlements:** server-authoritative usage facts, plan version, atomic quotas and customer-visible usage.
7. **API keys:** one-time secret display, hash-only persistence, scoped authorization, expiry and immediate revocation.
8. **Security center:** show evidence-backed controls and scan timestamps; distinguish configured, tested, passed, failed and unknown.

Each capability is a separate vertical slice with its own schema contract, authorization tests, UI states, telemetry and rollback plan.

### Phase E — Quality and security verification

**Required gates**
- Clean lockfile install and dependency audit.
- Strict production TypeScript check.
- Separate test-source typecheck.
- Unit, regression and property-based tests for parsers/state machines.
- Edge-function and worker adversarial tests.
- Database RLS tests with at least two synthetic users and an unauthenticated role.
- Browser E2E for sign-in, recovery, sign-out, workflow CRUD and execution.
- Accessibility checks: keyboard-only navigation, labels, focus order, contrast and reduced motion.
- Responsive checks at narrow Android viewport, tablet and desktop widths.
- Performance checks for bundle size, query count, pagination and worker execution budget.
- Secret scanning and browser-bundle inspection.

**Known test-quality gap:** candidate `tsconfig.json` excludes `src/**/*.test.ts`. The package manifest does not declare `@types/node`. The Node test runner executes TypeScript tests, but current lint/typecheck does not establish that those test files are TypeScript-type-safe. Add an explicit test tsconfig and declared Node type dependency only after a lockfile-backed install and exact-head CI prove it.

### Phase F — Release and operations

**Before production**
- Approved migration and rollback plan.
- Verified environment variables and secret ownership.
- Staging smoke tests and two-user isolation tests.
- Backup/restore and data-retention verification.
- Rate limits, abuse controls, quotas and alert thresholds.
- Incident runbook, support path and service ownership.
- Privacy policy, terms, pricing disclosures and cancellation/refund process.
- Human sign-off on the exact commit, build artifact, schema version and deployment target.

**Release rule:** no production deployment or billing activation without separate explicit human approval.

## 4. Architecture target

```text
React / TypeScript UI
  ├── Auth session provider (identity only)
  ├── Feature services (typed contracts)
  ├── Demo adapters (explicitly labelled, non-billable)
  └── Supabase browser client (publishable key only)
          |
          v
Trusted API / Edge Functions
  ├── Authentication and tenant resolution
  ├── Authorization and input validation
  ├── Rate limits and idempotency
  ├── Workflow orchestration
  ├── API-key lifecycle
  └── Usage / entitlement enforcement
          |
          v
PostgreSQL / Supabase
  ├── RLS-protected tenant data
  ├── Atomic RPCs and constraints
  ├── Workflow runs / step runs / logs
  ├── Append-only usage ledger
  └── Auditable billing events
          |
          v
Worker runtime
  ├── Authenticated queue claim
  ├── Lease + attempt fencing
  ├── Allowlisted deterministic actions
  ├── Bounded execution / retries
  └── Structured terminal events
```

The diagram is a target architecture, not a claim that every component is deployed or connected.

## 5. Fastest safe alternatives

| Constraint | Preferred safe alternative | Avoid |
|---|---|---|
| Vercel build-rate limit | Continue exact-head GitHub Actions; use local/browser preview only where available and approved | Repeated preview retries, plan upgrades or billing changes without approval |
| No verified schema capture | Build schema-independent UI and pure domain tests; prepare metadata-only verification | Guessing schema or applying migrations from stale types |
| No production backend proof | Use explicit demo adapters and synthetic fixtures | Pretending sample records are live |
| Expensive AI inference | Start with deterministic, allowlisted workflow actions; add model adapters behind quotas later | Unbounded agent loops or hidden paid API usage |
| Incomplete RLS evidence | Build two-user test fixtures and authorization contracts | Client-only route guards as security |
| No billing evidence | Keep pricing as research hypotheses and entitlement design | Publishing invented prices or accepting payments prematurely |

## 6. Current next actions

1. Preserve PR #102 as Draft and keep all source branches intact.
2. Complete the backend source review against the genuine schema capture.
3. Resolve test-source typecheck coverage.
4. Add a service-contract layer without enabling production mutations.
5. Build and verify one end-to-end workflow vertical slice in a non-production environment.
6. Add real browser/device and two-user RLS evidence.
7. Reassess Vercel only when the account rate-limit window permits; do not upgrade automatically.
8. Request explicit release approval only after all evidence gates pass.

## 7. Definition of done

A capability is **DONE** only when all are true:
- Implementation exists on the reviewed candidate commit.
- Contract and threat model are documented.
- Server/database authorization is enforced.
- Unit, integration, negative and regression tests pass.
- Real non-production behavior is demonstrated.
- UI accurately communicates loading, empty, error, denied and unavailable states.
- Logs and operational recovery are adequate.
- Accessibility and responsive checks pass.
- Cost and privacy impact are understood.
- Evidence is linked to the exact commit and environment.

Otherwise use **PARTIAL**, **BLOCKED** or **NOT TESTED**. Never convert unknown evidence into a green status.
