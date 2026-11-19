# Phase 4N.27 — Disposable PostgreSQL verification

## Decision

Use the main-based Phase 4N.21B source candidate as the integration base, then verify the Phase 4N.8B transactional RPC independently. Do not merge the divergent PR #35 and PR #46 histories.

## Why a separate verification branch exists

- PR #46 head: `b3091552cd205784f5ba7a200732f9047fddbf35`
- PR #35 head: `3b19c7c502ddfa17261ba457ee6757311b5e2032`
- Their histories are divergent, with merge base `4538bd0cceb3d2ee6adbaf36777047108229cf3c`.
- PR #46 is based on `main` and supplies the isolated Edge Function source baseline.
- PR #35 contains the transactional step-fencing RPC and worker call-site changes.

## Verification gap found

The existing Phase 4N.8B integration test is marked `ignore` unless fixture environment variables are present. The recorded successful CI run completed the test step but reported `0 passed | 0 failed | 1 ignored`. This is not concurrency-test evidence.

The existing test sends two RPC calls through one Supabase client with `Promise.all`. It does not coordinate two independent PostgreSQL sessions or control lock acquisition. It therefore does not establish deterministic database-session contention.

## New disposable contract harness

The new workflow starts a clean PostgreSQL 16 service container and runs the migration against a synthetic schema fixture containing only the tables, columns, and unique key required by the RPC.

The harness uses two independent `psql` processes:
1. Session A explicitly holds the parent workflow-run row lock.
2. Session B invokes a same-generation start and waits behind that lock.
3. Session A starts the step and commits.
4. Session B must then be rejected as a duplicate/superseded attempt.
5. The harness verifies stale completion rejection, transaction rollback, and successful replacement by a newer generation.

The runner refuses non-local database URLs and drops only fixture tables inside the ephemeral PostgreSQL service.

## Evidence boundaries

A passing harness demonstrates SQL syntax and RPC behavior against this **synthetic contract fixture only**. It does not prove:
- compatibility with the real Supabase schema;
- historical migration completeness or provenance;
- production RLS, grants, triggers, or foreign-key behavior;
- PostgREST schema-cache exposure;
- parity with deployed Edge Function source;
- durable retry, lease recovery, or hard timeout semantics.

The PR #46 baseline currently contains no tracked `supabase/migrations/` directory. PR #35 contains only the Phase 4N.8B migration in that directory. The authoritative historical schema must be obtained from reviewed migration sources or a separately approved, read-only schema export before any real database rollout.

## Release gates

- [ ] Disposable PostgreSQL workflow passes on this branch's exact head.
- [ ] SQL fixture is reviewed as a test contract, not production schema.
- [ ] Authoritative Supabase schema and migration provenance are verified.
- [ ] Two-session race, rollback, stale recovery, and ownership cases are tested against the authoritative disposable schema.
- [ ] Worker integration is tested against the verified RPC contract.
- [ ] Dependency advisories are reviewed and remediated or explicitly accepted.
- [ ] Human review and separate merge approval.
- [ ] Separate production migration and deployment approvals.

## Safety

No production database, Supabase project, secrets, environment variables, deployment, billing, merge, or live traffic is touched by this workflow.

## Verified branch implementation and CI evidence

### Implemented on the isolated branch

- Ported the Phase 4N.8B migration and both worker call sites from PR #35 onto the main-based PR #46 source baseline.
- Both workers now call `simula_transition_workflow_step` for step start/success/failure transitions. Static inspection found one RPC call site per worker and no direct `workflow_step_runs` insert/update calls in either worker.
- Parent-run success/failure updates retain owner, running-status, and exact-attempt predicates.
- Added a disposable PostgreSQL 16 test job with two independent `psql` sessions and a lock/connection barrier.
- The fixture runner accepts only the exact local disposable service URL configured by CI; it refuses arbitrary database URLs.

### Dependency remediation

The initial lockfile audit found:
- `vite`: high severity advisories;
- `esbuild`: moderate severity advisory.

The candidate was upgraded to Vite `8.3.8` and `@vitejs/plugin-react` 6.x. The committed lockfile resolves `@vitejs/plugin-react` `6.3.0` and Rolldown `1.2.19`. Node `22.16.0` satisfies the Vite 8 and plugin engine requirements.

The lockfile was generated with `npm install --package-lock-only --ignore-scripts --no-audit` on the isolated branch and committed as `0954050f1308d99e2cbe37169986c80fe1dd1515`. Lifecycle scripts were disabled during lockfile generation.

### Exact CI evidence

GitHub Actions run `44635347256` completed successfully on the dependency-upgrade candidate:
- npm dependency audit: **0 vulnerabilities**;
- Node CORS tests: 6 passed, 0 failed;
- Node worker-security tests: 10 passed, 0 failed;
- Deno worker-security tests: 6 executed;
- authenticated worker, cron worker, and optional Supabase integration-test type checks passed;
- TypeScript application build and Vite production build passed (1,564 modules transformed);
- disposable PostgreSQL contract harness passed, including independent-session same-generation contention, stale completion rejection, rollback, and newer-generation replacement.

This run generated the lockfile in the runner from the same manifest and command used by the lockfile-sync workflow. A subsequent exact-head run is required after the lockfile commit and this evidence update.

### Remaining blockers

- The passing PostgreSQL test still uses a synthetic contract schema. Production schema compatibility remains **NOT VERIFIED**.
- Historical migration bodies, deployed function parity, PostgREST exposure, RLS, and grants in the actual Supabase project remain **NOT VERIFIED**.
- Existing Vercel status checks report `build-rate-limit`; no production deployment was attempted.
- No PR was created, no merge occurred, and no production migration or deployment was performed.
