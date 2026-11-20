# Phase 51.1 — Live Database Contract Verification

**Status:** Read-only verification completed; implementation remains blocked on contract decisions and isolated integration testing.  
**Verified:** Supabase PostgreSQL catalog queried on 2026-11-20.  
**Scope:** Catalog metadata, function definitions/privileges, RLS policies, table/column grants, and aggregate row counts. No writes were issued.

## Executive summary

The live database is not yet a durable per-step retry engine. The current schema supports a single persisted step-run row per (run_id, step_id), while worker claim functions increment a workflow-run generation/attempt counter. These are different concepts and must not be conflated with a logical step retry number or queue delivery count.

The live schema also contains a user-scoped SECURITY DEFINER claim function and an internal service-worker claim path. Their grants and authorization predicates differ materially. Preserve that separation.

No workflow configuration or run rows existed at verification time, so populated retry/timeout values and migration impact could not be inspected. Catalog constraints were verified; populated-data compatibility remains unverified.

## Verified database contract

### Tables, constraints, and indexes

#### public.workflow_runs

- Primary key: id.
- Foreign keys: owner_id -> auth.users(id) ON DELETE CASCADE; workflow_id -> workflows(id) ON DELETE CASCADE.
- Status check allows exactly: queued, running, succeeded, failed, cancelled.
- attempt >= 0.
- Indexes: primary key on id; (owner_id, created_at DESC); partial queue index on created_at where status is queued; unique (workflow_id, scheduled_for).

#### public.workflow_step_runs

- Primary key: id.
- Foreign keys: run_id -> workflow_runs(id) ON DELETE CASCADE; step_id -> workflow_steps(id) ON DELETE CASCADE; owner_id -> auth.users(id) ON DELETE CASCADE.
- Unique constraint: UNIQUE (run_id, step_id).
- Status check allows exactly: queued, running, succeeded, failed, skipped.
- attempt >= 0.
- Indexes include (run_id, created_at), owner_id, and step_id.

**Consequence:** one row per logical step in a run cannot retain multiple immutable retry attempts. Updating this row for another retry overwrites prior step execution state. Do not treat this table as an append-only attempt ledger.

#### public.workflow_steps

- Primary key: id.
- Unique (workflow_id, step_order).
- Foreign key: workflow_id -> workflows(id) ON DELETE CASCADE.
- retry_limit constraint: integer range 0–10 inclusive.
- timeout_seconds constraint: integer range 1–3600 inclusive.
- step_order > 0.

At verification time, workflow_steps had 0 rows. Therefore no current retry/timeout value distribution or migration impact could be established. workflow_runs and workflow_step_runs also had 0 rows.

## Claim functions and authorization

### User-scoped claim path

private.simula_claim_workflow_runs(integer) is PL/pgSQL, SECURITY DEFINER, with an empty search path. It:

1. derives the owner from auth.uid();
2. rejects a null owner with SQLSTATE 28000;
3. clamps the batch limit to 1–5;
4. selects only that owner's queued workflow runs;
5. uses FOR UPDATE SKIP LOCKED;
6. changes selected rows from queued to running, sets started_at, clears terminal/error fields, and increments workflow_runs.attempt;
7. returns run ID, workflow ID, owner ID, input, and incremented attempt.

The public SQL wrapper public.simula_claim_workflow_runs(integer) delegates to this private function. Catalog privileges showed EXECUTE for authenticated and service_role on the private and public user-scoped variants. The private function's auth.uid() owner derivation is an important isolation control; preserve it and test it with two synthetic users.

### Internal worker claim path

private.simula_claim_workflow_runs_internal(integer) is SECURITY DEFINER, with an empty search path. It has no end-user owner predicate, so it is a trusted worker-only operation. It:

- requeues running workflow runs older than 15 minutes when attempt < 5;
- marks such runs failed when attempt >= 5;
- selects queued rows across owners using FOR UPDATE SKIP LOCKED;
- changes selected rows to running and increments workflow_runs.attempt.

Its public wrapper public.simula_claim_workflow_runs_internal(integer) delegates to the private implementation. Catalog privileges showed the internal variants executable by service_role (and postgres), not authenticated. Do not grant this broad cross-owner queue claim to user-facing roles.

### Scheduled enqueue function

private.simula_enqueue_due_workflows() is SECURITY DEFINER. It selects due active schedule workflows, validates interval configuration to 60–2,592,000 seconds, uses row locking with SKIP LOCKED, inserts queued runs, uses the unique (workflow_id, scheduled_for) key for duplicate suppression, and advances next_run_at. Its catalog EXECUTE privilege was observed for postgres only.

### Function privilege caveat

The private user-scoped claim function is executable by authenticated users, but its body derives and enforces auth.uid(). The private internal claim function is service-role-only. Keep those contracts distinct. This inspection did not invoke any claim/enqueue function; behavior conclusions are from catalog definitions, not live execution tests.

## RLS and grants

Observed RLS policies:

- workflow_runs: authenticated INSERT requires owner_id = auth.uid() and an owned parent workflow; SELECT is owner-scoped.
- workflow_step_runs: authenticated SELECT is owner-scoped.
- workflow_steps: authenticated ALL policy is scoped through an owned parent workflow.

Observed table grants:

- workflow_runs: authenticated INSERT and SELECT; service_role has worker-level table privileges.
- workflow_step_runs: authenticated SELECT; service_role has worker-level table privileges.
- workflow_steps: authenticated SELECT/INSERT/UPDATE/DELETE; service_role has worker-level table privileges.
- No anon grants appeared in the inspected table/column privilege result.

Important: authenticated has column-level INSERT on several workflow_runs lifecycle columns, including attempt, status, output, error_message, started_at, finished_at, created_at, id, and scheduled_for. The private.enforce_workflow_run_insert_defaults() BEFORE INSERT trigger overrides worker-managed state for authenticated requests: status becomes queued, attempt becomes 0, output/error/timestamps are nulled, and the trigger verifies owner and parent workflow ownership.

This trigger is a defense, not a reason to retain an unnecessarily broad client insert contract. Keep frontend requests restricted to the minimal workflow_id + validated JSON input shape and do not expose generated broad insert types as the public application API.

## Important semantic distinctions

Keep three counters separate:

1. Workflow run generation / claim attempt: current workflow_runs.attempt, incremented on each run claim and used by current stale-worker/recovery logic.
2. Logical step retry number: required future per-step counter governed by workflow_steps.retry_limit; no verified append-only persistence contract exists yet.
3. Queue delivery count: operational delivery/reclaim metric; must not be silently substituted for either of the above.

Current worker recovery is run-level, with a 15-minute stale-running threshold and hard-coded max of five run claims in the internal claim function. That is not equivalent to enforcing each step's retry_limit.

## Implementation blockers and recommended design

1. Do not implement step retry by overwriting workflow_step_runs. Preserve the unique one-row summary if useful for current UI, and design a separate append-only workflow_step_attempts ledger (or equivalent composite attempt identity) for immutable per-attempt evidence.
2. Define whether retry_limit means retries after the first attempt. Recommended convention: total logical attempts = 1 + retry_limit. Confirm this in API docs, state machine, UI labels, and tests.
3. Keep workflow-run claim generation separate from step retry number and queue delivery count.
4. Reconcile runtime timeout validation (previous source inspection found 1–300 seconds) with the database's 1–3600-second constraint. Do not narrow or widen production constraints until actual values and product requirements are reviewed. Current table is empty, but this does not authorize schema changes.
5. Replace the hard-coded run recovery limit with a deliberate, documented run-level policy only after analyzing worker ownership, lease duration, heartbeat strategy, and retry/backoff semantics. A stale-run reclaim must be fenced so an old worker cannot commit after a newer generation claims the run.
6. Use bounded exponential backoff with jitter and persisted next_attempt_at; do not sleep in memory or spin retry loops.
7. Persist lease owner/token, lease expiry, heartbeat, generation/fencing token, idempotency key, attempt number, classified error, and timestamps in a durable design. Keep secrets and raw sensitive payloads out of logs.
8. Preserve explicit action allowlists; never execute arbitrary user-supplied code.
9. Build synthetic Owner A/Owner B tests for RLS, claim scope, parent workflow ownership, duplicate delivery, stale generation, and cancellation.
10. Treat all proposed schema changes and grant changes as design-only until a reviewed migration plan and explicit approval exist.

## Verification matrix

| Area | Result | Evidence |
|---|---|---|
| Table constraints and indexes | VERIFIED | PostgreSQL catalog definitions |
| Run/step status enums | VERIFIED | CHECK constraints |
| Claim function definitions | VERIFIED | pg_get_functiondef |
| Function EXECUTE grants | VERIFIED | information_schema.routine_privileges |
| Table/column grants | VERIFIED | information_schema.table_privileges and column_privileges |
| RLS policies | VERIFIED | pg_policies |
| Current workflow row values | VERIFIED EMPTY | Aggregate counts returned zero |
| Retry/timeout populated-data compatibility | BLOCKED | No workflow_steps rows exist |
| Worker functions under real concurrent load | NOT TESTED | No function execution or load test performed |
| Frontend enqueue/status integration | NOT VERIFIED | Existing frontend inventory identified demo-only UI |
| Durable per-step retry history | NOT IMPLEMENTED | Current unique key permits one row per run/step |

## Safety statement

This verification used SELECT/catalog reads only. No migrations, DDL, DML, grants, revokes, RLS changes, function calls, Edge Function deployments, secrets, production data mutations, merges, or releases were performed.
