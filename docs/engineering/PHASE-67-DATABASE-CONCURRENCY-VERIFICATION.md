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

## 5. Critical reproducibility blocker

The candidate GitHub branch contains no `supabase/config.toml` and no `supabase/migrations/` directory. The connected live database reports 19 applied migration versions, including the workflow schema, queue claims, private-schema hardening, cron scheduling, stale-run recovery, and related security work.

Therefore:

- A fresh local Supabase stack cannot currently recreate the connected database from this repository.
- A pgTAP test file alone would not be runnable against a faithful local schema.
- A hand-written replacement schema or copied approximation would risk testing a different implementation.
- Running `supabase test db` against the hosted project is not an acceptable shortcut: current Supabase CLI v3 documentation says hosted testing can enable and later drop pgTAP, so it is not a strictly read-only verification path.

**Required next step:** recover and review the exact migration source corresponding to the 19 applied versions, commit the canonical migration history and compatible Supabase config to the candidate branch, and prove a clean local database can be reconstructed before writing runnable database integration tests.

## 6. Phase 68 test acceptance criteria

After schema source is reproducible, run isolated PostgreSQL/Supabase tests with synthetic rows and no production data:

1. Two concurrent internal claim calls never return the same run ID.
2. A locked queued row is skipped by the second claimant.
3. Each successful claim increments attempt exactly once.
4. Expired running rows below attempt 5 are requeued and claimed with a strictly newer generation.
5. Expired running rows at attempt 5 become failed and are not reclaimed.
6. Two concurrent step-run inserts produce exactly one `(run_id, step_id)` row.
7. A stale generation cannot overwrite a newer step-run result.
8. A worker whose lease was reclaimed cannot finish or fail the workflow run.
9. Authenticated claim cannot claim another owner's queue row.
10. Internal claim and secret verification are denied to anon/authenticated roles.

Use a disposable local database or isolated test project only. Do not point destructive or extension-mutating test commands at the production project.

## 7. Safety and release boundary

- Catalog reads only; no production DDL or DML.
- No migration, grant, RLS, secret, cron, or function changes.
- No production worker deployment.
- No merge or release.
- No hosted pgTAP execution.
- No claims of live concurrency success.

**Phase 67 decision:** database contracts are verified from live catalog definitions; live concurrent execution is NOT TESTED. The missing migration source in GitHub is the immediate blocker to a trustworthy repeatable integration test.
