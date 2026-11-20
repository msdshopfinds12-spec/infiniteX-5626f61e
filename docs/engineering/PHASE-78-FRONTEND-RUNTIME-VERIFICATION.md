# Phase 78 — Frontend Runtime and Authenticated Integration Verification

**Status:** PLAN — implementation and exact-head CI evidence pending.  
**Base:** `phase-77/worker-postgres-integration` at `2cbd351108bbe7c8dc3d777e43e0c1f2fffcf1e6`  
**Branch:** `phase-78/frontend-runtime-verification`  
**Scope:** Verify existing React/Supabase read-only integration and close runtime evidence gaps without enabling mutations.

## 1. Starting evidence

The base branch already contains:
- a validated browser Supabase client using only public URL/publishable-key configuration;
- session restoration, auth-state subscription cleanup, and explicit auth states;
- authenticated read-only profile, project, and workflow services;
- workflow list, run history, and event metadata views;
- safe column projections, bounded query limits, and normalized errors;
- identity-epoch request fencing intended to prevent stale account data from rendering;
- read-only project/workflow UI and explicit demo labels for unconnected modules.

Phase 77 PostgreSQL integration passed on its exact candidate commit. This verifies isolated database harness behavior, not live hosted Supabase or browser runtime behavior.

## 2. Objective

Produce repeatable evidence that the existing authenticated browser integration behaves correctly under startup, account transitions, failures, and authorization boundaries. Do not duplicate already-implemented service layers or invent schema fields.

## 3. Required workstreams

### A. Frontend exact-head baseline
- Run `npm ci`, `npm run lint`, `npm test`, and `npm run build` in GitHub Actions on the exact Phase 78 head.
- Preserve the committed lockfile; never hand-edit npm lock metadata.
- Keep workflow permissions read-only and third-party actions pinned to immutable SHAs.
- Record the exact commit SHA and run URL.

### B. Auth lifecycle and identity fencing
- Test initial session restoration and auth event races.
- Test sign-out and account A → account B transitions.
- Assert no previous identity's profile, projects, workflows, runs, or logs remain visible after identity changes.
- Test late responses from the previous identity are ignored.
- Test adapter exceptions and network failures produce safe, bounded UI states.
- Test React StrictMode effect setup/cleanup does not leak subscriptions or duplicate visible data.

### C. Read-only UI behavior
- Test loading, ready, empty, error, retry, and unavailable-service states.
- Test workflow search and run/event expansion.
- Assert raw SQL/provider errors, workflow input/output, log details, tokens, and secret fields never appear in rendered UI.
- Test keyboard operation, focus visibility, semantic status messages, and narrow Android viewport behavior.
- Keep all unsupported mutation controls disabled or clearly unavailable.

### D. Local Edge Function runtime parity
- Determine whether Deno and Supabase CLI are available in the CI environment without adding paid dependencies.
- Run the repository-owned worker/auth boundary tests in the actual Deno runtime where feasible.
- Use a disposable local PostgreSQL/Supabase environment and synthetic users only.
- Exercise authenticated HTTP requests against local functions and verify owner derivation, authorization failure, request bounds, and safe response projection.
- If the runtime cannot be provisioned reproducibly, record the exact blocker and keep runtime parity NOT VERIFIED. Do not replace runtime tests with source-regex assertions and call them equivalent.

### E. Security regression
- Verify no service-role, secret key, worker secret, or provider credential is imported into browser modules or Vite environment.
- Verify no browser service accepts caller-supplied owner identity.
- Verify RLS remains the database authorization boundary.
- Verify API-key hashes and one-time raw credentials are not exposed in list/read responses or logs.
- Keep test data synthetic and isolated.

## 4. Acceptance criteria

Phase 78 is complete only when:
1. Exact-head frontend CI passes all required install, lint, test, and build jobs.
2. Auth lifecycle and account-switch tests pass, including stale-response fencing.
3. UI state and sensitive-field redaction tests pass.
4. Local Deno/Edge Function HTTP integration passes against disposable infrastructure, or the unsupported runtime is explicitly recorded as BLOCKED with reproducible evidence.
5. No production or hosted Supabase state is modified.
6. A source-backed audit records VERIFIED / PARTIAL / BLOCKED / NOT TESTED per capability.

## 5. Explicit exclusions and approval gates

This phase does not authorize:
- hosted Supabase migrations, SQL writes, grants, RLS changes, or schema edits;
- reading, rotating, or changing production secrets;
- deploying Supabase Edge Functions;
- enabling workflow execution or browser-side database mutations;
- paid provider activation, billing changes, or paid infrastructure;
- Vercel production deployment, domain changes, or deployment-setting changes;
- merging to the default branch or releasing publicly.

Any action outside the disposable test environment requires a separate explicit approval.

## 6. Deliverables

- focused auth/session and account-switch regression tests;
- component/browser tests for read-only workflow/project/profile states;
- reproducible local Edge Function runtime test harness, if supported;
- GitHub Actions exact-head evidence;
- `docs/engineering/PHASE-78-FRONTEND-RUNTIME-VERIFICATION.md` updated with actual results;
- concise remaining-gap register and next-phase recommendation.

## 7. Decision rule

Do not begin Phase 79 visual redesign until the Phase 78 correctness/security gate is green. Do not call InfiniteX production-ready based on CI alone. Production readiness requires authoritative schema provenance, deployed function parity, live RLS verification, observability, rollback/restore evidence, and human release approval.
