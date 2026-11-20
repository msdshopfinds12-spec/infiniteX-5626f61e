# Phase 67 — Database Concurrency Verification

**Inspection date:** 2026-11-21  
**Project:** Ashaa-INX / `vepacoemkhudamfaccah`  
**Git candidate:** `engineering/infinitex-canonical-integration-candidate`  
**Inspection mode:** Read-only catalog and metadata queries  
**Status:** LIVE DATABASE CONTRACT VERIFIED; CONCURRENT EXECUTION TEST BLOCKED BY MISSING REPRODUCIBLE SCHEMA SOURCE

## 1. Executive result

The live PostgreSQL 17 catalog confirms the main primitives required for safe workflow claiming and step-run fencing:

- Claim RPCs use `FOR UPDATE SKIP LOCKED`.
- Claiming changes queued runs to running and increments `workflow_runs.attempt` in the same SQL statement.
- The internal claim function requeues abandoned runs after 15 minutes when attempt < 5 and marks them failed when attempt >= 5.
- `workflow_step_runs` has a unique constraint on `(run_id, step_id)`.
- Candidate worker updates use a conditional `attempt < claimedAttempt` predicate when taking over an existing step row, and exact-attempt predicates for terminal updates.
- The public internal-claim wrapper and worker-secret verification function are not executable by `anon` or `authenticated` according to the inspected routine grants.

This verifies database definitions and catalog metadata. It does **not** prove behavior under two real concurrent sessions, lease timing, transaction scheduling, or deployed worker races.

## 2. Verified live RPC behavior

### Authenticated claim path

`private.simula_claim_workflow_runs(integer)`:

- SECURITY DEFINER with an empty search_path.
- Requires `auth.uid()`; rejects unauthenticated calls.
- Clamps batch size to 1..5.
- Selects only the caller's queued runs.
- Orders by `created_at, id`.
- Uses `FOR UPDATE SKIP LOCKED`.
- Updates the selected rows to `running`, sets `started_at`, clears terminal fields, and increments `attempt` atomically.

The public `simula_claim_workflow_runs(integer)` function is an invoker SQL wrapper. The inspected routine grants include authenticated, postgres, and service_role; no anon grant was returned.

### Internal cron claim path

`private.simula_claim_workflow_runs_internal(integer)`:

- SECURITY DEFINER with an empty search_path.
- Clamps batch size to 1..5.
- Marks running rows older than 15 minutes and with attempt >= 5 as failed.
- Requeues running rows older than 15 minutes and with attempt < 5.
- Claims queued rows with `FOR UPDATE SKIP LOCKED`.
- Increments attempt in the same update that changes status to running.

The public internal wrapper is an invoker SQL wrapper. The inspected grants include postgres and service_role only; no anon or authenticated grant was returned.

### Worker-secret verifier

`public.simula_verify_worker_secret(text)` is SECURITY DEFINER with an empty search_path and checks the supplied value against the Vault secret named `simula_worker_secret`. The inspected grants include postgres and service_role only. Secret values were not read.

## 3. Verified schema constraints and indexes

- `workflow_step_runs_run_id_step_id_key`: UNIQUE (`run_id, step_id`).
- `workflow_runs`: primary key on `id`, owner/workflow foreign keys, valid status check, nonnegative attempt check.
- `workflow_step_runs`: primary key on `id`, run/step/owner foreign keys, valid status check, nonnegative attempt check.
- Queue index: partial index on `workflow_runs(created_at)` where status is queued.
- Step-run lookup indexes: `(run_id, created_at)`, `step_id`, and `owner_id`.

The unique step-run key supports one row per run/step and makes the candidate insert-conflict recovery path meaningful.

## 4. Candidate fencing contract

Both candidate workers now:

1. Read the existing step-run attempt.
2. Reject an equal, newer, or malformed stored generation before taking over.
3. Update only when the stored database generation is lower than the claimed generation.
4. Finish or fail a step only when its attempt still equals the worker's claimed generation.
5. Finish or fail the workflow run only when its attempt still equals the claimed generation.

The pre-read helper is an early rejection only. The conditional SQL update is the authoritative compare-and-set.

## 5. Reproducible migration source — restored

The migration source was found on historical repository recovery branches and restored into the active candidate from exact Git blob references.

- 19 SQL files represent ledger-recovered applied statements.
- The checked-in manifest preserves all 19 SHA-256 digests and provenance fields.
- Original historical Git-file equivalence remains NOT_VERIFIED.
- The 20th SQL file remains a separately classified proposed candidate, not applied to the live database.
- The reconstructed workflow baseline remains a noncanonical disposable fixture.
- The candidate has a dedicated PostgreSQL 17 replay workflow. No hosted Supabase database is used by this workflow.

## 6. Isolated PostgreSQL 17 execution results

<badge>PASS — candidate head `37863d751532e8293a0a4f69c9fb16d1a7b7c278`</badge>

The Phase 68 disposable replay and concurrency workflow passed on the exact candidate head:

- [Push replay + concurrency + security — SUCCESS](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44795384056)
- [PR replay + concurrency + security — SUCCESS](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44795393676)
- [Push candidate quality gates — SUCCESS](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44795384077)
- [PR candidate quality gates — SUCCESS](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44795393670)

The replay job completed:
1. Provenance and migration-rehearsal tests.
2. Startup of an isolated Supabase PostgreSQL 17 container with scheduled jobs disabled.
3. Execution of all 19 ledger-recovered applied statements and the separately classified candidate migration in the disposable database.
4. Real multi-session row-lock contention: one session holds the oldest queued row; a separate service-role claim skips the locked row and claims the next row; after release, a subsequent claim receives the first row with its own generation.
5. Fifteen-minute stale-lease recovery below attempt 5 and terminal failure at attempt 5.
6. Duplicate step-run identity and stale-generation terminal-update checks.
7. Separate disposable security behavior suite and container cleanup.

**Precision note:** the concurrency harness uses real PostgreSQL sessions and row locks, not a pure in-memory model. The two claim calls are sequential around a deliberately held row lock; this proves the `SKIP LOCKED` behavior and distinct claims under contention, but it is not a stress test of many simultaneous claim RPCs or a full deployed-worker race reproduction.

## 7. Remaining acceptance criteria

| Check | Status |
|---|---|
| All 19 ledger-recovered SQL files present and checksummed | PASS |
| Disposable PostgreSQL 17 migration replay | PASS |
| Real row-lock contention / `SKIP LOCKED` behavior | PASS |
| Lease reclaim below attempt 5 | PASS |
| Terminal failure at attempt 5 | PASS |
| Step-run uniqueness and stale-generation CAS behavior | PASS |
| Disposable security behavior suite | PASS |
| Bounded 16-session / 80-run parallel claim stress | PASS (Phase 69) |
| Full deployed Edge Function end-to-end workflow | NOT TESTED |
| Live catalog parity with disposable replay | NOT ESTABLISHED |
| Production worker rollout | NOT AUTHORIZED |

## 8. Safety and release boundary

- All database writes in this phase occurred only in the isolated PostgreSQL 17 CI container using synthetic rows.
- Connected Ashaa-INX inspection remained read-only.
- No hosted production DDL/DML, migration, grant, RLS, secret, cron, or function changes.
- No production worker deployment, merge, or release.

**Phase 67 decision:** the previous migration-source blocker is resolved for candidate reproducibility. Core claim, lease-recovery, uniqueness, and generation-fencing behaviors now have isolated PostgreSQL execution evidence. High-volume contention, full live catalog parity, and deployed runtime parity remain open.


## 9. Phase 69 — bounded parallel claim stress

<badge>PASS — exact candidate head `aaf9bb1d3f16904ec07d5e32b1c495ec8010dd3a`</badge>

- [PR PostgreSQL replay + Phase 69 stress + security — SUCCESS](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44796503703)
- [PR quality gates — SUCCESS](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44796503555)

The new harness launched 16 independent PostgreSQL sessions to claim 80 synthetic queued runs in batches of five. Assertions verified 80 total claims, 80 unique IDs, generation 1 for every claim, no duplicates, and no remaining queued fixtures. It also launched two independent inserts for the same `(run_id, step_id)` key and verified exactly one row persisted.

This upgrades the evidence from a single held-row contention scenario to bounded multi-session parallel claim stress. It remains a finite CI test, not a sustained load benchmark or full Edge Function end-to-end test. All writes remained inside the disposable PostgreSQL 17 container.
