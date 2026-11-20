# Phase 50.3 — Workflow Worker Reliability Gap Analysis

**Inspection date:** 2026-11-20  
**Evidence:** source files at branch `feat/phase-50-trusted-authorization`, plus read-only live schema/function metadata  
**Change class:** documentation only; no production mutation

## Executive summary

The existing worker has meaningful security controls: authenticated user worker calls verify the Supabase user with `getUser(token)`; owner identity is derived from that verified user; user queue claims are owner-scoped; the cron worker uses a separate Vault-backed worker-secret check; run/step state updates use attempt-generation compare-and-set conditions.

The following reliability gaps were confirmed from source/schema comparison. They should be addressed before calling workflow execution production-complete.

## 1. Confirmed functional gap: retry_limit is not enforced

**Evidence**
- `workflow_steps.retry_limit` exists and the database constraint permits values from 0 through 10.
- Both `simula-workflow-worker/index.ts` and `simula-workflow-cron-worker/index.ts` select `retry_limit` for every step.
- Neither worker reads or branches on `step.retry_limit`.
- On the first action failure, the current worker marks the step and run failed; no per-step retry loop is executed.

**Impact**
The workflow editor/database contract exposes a retry setting that currently has no execution effect. Users can configure retries and reasonably expect them to happen, but the worker does not honor that setting.

**Safe remediation**
1. Define semantics precisely: maximum retries after the initial attempt, so total attempts = 1 + retry_limit.
2. Separate workflow-run generation from per-step attempt number. Do not overload the existing run-generation field used for stale-worker fencing.
3. Add a persisted per-step attempt counter or an explicit attempt history model, plus atomic compare-and-set transitions.
4. Retry only classified transient failures; validation errors and unsupported action types should fail immediately.
5. Add bounded exponential backoff with jitter and a hard overall run deadline.
6. Add deterministic tests for retry_limit 0, 1, maximum, transient/permanent failures, worker supersession, and duplicate delivery.
7. Keep current behavior until the schema and state machine can support these semantics safely. Do not add an in-memory retry loop that can lose state on isolate termination.

## 2. Contract mismatch: database timeout range vs runtime policy

**Evidence**
- Live database check constraint permits `workflow_steps.timeout_seconds` from 1 through 3600.
- Shared runtime validator `validateStepTimeoutSeconds` rejects explicit values greater than 300 seconds.
- Both worker implementations call this validator before executing a step.

**Impact**
A row accepted by the database can still fail during execution when timeout_seconds is 301–3600. The persisted configuration contract and runtime contract disagree.

**Safe remediation**
- Choose one canonical maximum. For a serverless synchronous action engine, retain a conservative runtime maximum (e.g. 300 seconds) and prepare a database constraint migration to match it, after reviewing existing rows and product requirements.
- Alternatively, move long-running steps to an asynchronous job model with leases, heartbeats, cancellation, and resumable state; do not simply raise the synchronous cap to one hour.
- Add a contract test that asserts the documented database maximum and runtime maximum stay aligned.
- Before migration, run a read-only inventory of existing values above the proposed cap and provide a compatibility plan.

## 3. Cooperative budget is not hard preemption

**Evidence**
`executeWithinStepBudget` checks a monotonic deadline immediately before and after invoking a synchronous action. Its own source comment explicitly says it cannot preempt a synchronous function that blocks the JavaScript isolate.

**Impact**
The timeout is an elapsed-time guard, not an interruptible execution timeout. Current built-in actions are local synchronous transformations, which limits exposure, but future CPU-heavy or external actions must not assume this helper can terminate them at the deadline.

**Safe remediation**
- Keep the supported action registry deterministic, local, and payload-bounded.
- Do not run arbitrary user-supplied code in this worker.
- For asynchronous/external actions, use a separately cancellable execution boundary with durable job state, idempotency keys, and lease renewal.
- Name and document the current behavior as a cooperative elapsed-time budget, not a hard timeout.

## 4. Ownership and claim controls verified in source/schema

- User-facing worker verifies the bearer token using Supabase Auth `getUser(token)`.
- User-facing claim RPC derives `auth.uid()`, selects only queued runs owned by that user, and uses `FOR UPDATE SKIP LOCKED`.
- Cron worker verifies `x-simula-worker-secret` through `simula_verify_worker_secret` before invoking the internal claim RPC.
- Internal claim RPC intentionally processes the shared queue and is only safe behind the trusted worker-secret gate.
- Both workers validate parent workflow ownership before reading workflow steps.
- Workflow step rows have `workflow_id` but no `owner_id`; the validated parent workflow ID is the ownership boundary for those rows.
- Worker state transitions use attempt-generation predicates to prevent stale workers from overwriting newer generations.

These are positive controls, but they do not replace Owner A/Owner B adversarial integration tests.

## 5. Recommended implementation order

1. Add a worker behavior contract covering retry semantics, timeout semantics, state transitions, and idempotency.
2. Add tests that demonstrate the current retry_limit no-op and timeout mismatch.
3. Decide whether retries are in-run persisted attempts or new workflow-run generations.
4. Design schema changes for durable per-step attempts and worker leases; write migration proposal only.
5. Align database/runtime timeout policy after reading existing data values.
6. Implement transient failure classification and backoff.
7. Test duplicate delivery, worker crash/restart, lease expiry, stale generations, Owner A/Owner B separation, and max-attempt behavior using synthetic identities.
8. Run CI and independent review before any deployment.

## 6. Explicit non-actions

No SQL writes, schema changes, migrations, grants/revokes, RLS changes, data updates, Edge Function deployments, secret changes, billing actions, Vercel deployments, merges, or releases were performed. The production worker behavior is unchanged.
