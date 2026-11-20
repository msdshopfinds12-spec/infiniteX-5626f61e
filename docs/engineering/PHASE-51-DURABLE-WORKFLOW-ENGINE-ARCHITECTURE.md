# Phase 51 — Durable Workflow Execution Engine Architecture

**Status:** Proposal / design only  
**Parent baseline:** Phase 50 authorization branch head `f4d08b55159aa1200321f17321754f07cb7ae458`  
**Runtime status:** Not implemented or deployed  
**Design constraints:** free-first, Supabase Edge Functions, PostgreSQL, TypeScript/Deno, mobile-first client, fail-closed authorization

## 1. Objective

Make workflow execution durable under duplicate delivery, worker interruption, retries, stale workers, and bounded execution. Preserve the current trusted identity and owner-isolation boundaries. Do not run arbitrary user-supplied code.

## 2. Current verified gaps

1. Both workflow workers select `workflow_steps.retry_limit` but do not enforce it.
2. The database timeout constraint permits 1–3600 seconds while runtime validation rejects values above 300 seconds.
3. `executeWithinStepBudget` is cooperative; it cannot preempt a synchronous JavaScript operation.
4. Existing worker generation predicates provide stale-worker protection, but they are not a persisted per-step retry history.

## 3. Target architecture

```text
Mobile/Web Client
  | authenticated minimal enqueue request
  v
Trusted Enqueue API
  | derives owner from verified Supabase JWT
  | validates workflow ownership and input schema
  | enforces idempotency key
  v
PostgreSQL Queue (durable source of truth)
  | atomic claim / lease / attempt record
  v
Worker Dispatcher
  | bounded concurrency + lease heartbeat
  v
Step Executor (allowlisted actions only)
  | persisted result / retry schedule / terminal state
  v
Audit Events + Safe UI Status Projection
```

The browser never chooses `owner_id`, worker identity, lifecycle state, attempt counters, result fields, or permissions.

## 4. Proposed data model (migration proposal only)

### A. `workflow_step_attempts`
Suggested columns:
- `id uuid primary key`
- `workflow_run_id uuid not null`
- `workflow_step_id uuid not null`
- `owner_id uuid not null`
- `attempt_number integer not null check (attempt_number >= 1)`
- `status text not null` (values must be aligned with existing status conventions)
- `idempotency_key text not null`
- `started_at timestamptz`
- `finished_at timestamptz`
- `next_retry_at timestamptz`
- `error_code text` (safe, normalized code only)
- `output_json jsonb` (bounded and schema-validated)
- `created_at timestamptz not null default now()`

Constraints/indexes:
- unique `(workflow_run_id, workflow_step_id, attempt_number)`
- unique `idempotency_key`
- index pending attempts by `status, next_retry_at`
- foreign keys must match actual deployed table keys and delete semantics after schema review.

Do not store raw secrets, access tokens, or unredacted provider responses in error/output columns.

### B. Durable run/worker lease
Prefer a separate lease relation if changing `workflow_runs` would create excessive compatibility risk. Proposed fields: run ID, worker lease token hash, lease expiry, heartbeat timestamp, claimed generation, and updated timestamp. Lease token material must not be exposed to clients.

A lease is valid only when its token/generation matches the currently persisted claim. Stale workers must not commit state transitions.

## 5. State machine

Each step attempt:
- `pending` → `running`
- `running` → `succeeded`
- `running` → `retry_wait` only for a classified transient failure and while retry budget remains
- `retry_wait` → `running` when due and atomically claimed
- `running` → `failed` for permanent failure or exhausted retry budget
- `pending/retry_wait` → `cancelled` when a trusted cancellation request wins the compare-and-set

A workflow run becomes successful only when all required steps have succeeded. It becomes failed when a required step reaches terminal failure. Cancellation is a trusted server transition. Exact run/step status vocabulary must be reconciled with existing schema before implementation.

## 6. Retry semantics

Define `retry_limit` as retries after the initial attempt:
- retry_limit = 0 → one total attempt
- retry_limit = 1 → at most two total attempts
- retry_limit = 10 → at most eleven total attempts

Only explicitly classified transient failures are retryable. Examples may include bounded network failures and temporary provider unavailability after a provider integration exists. Validation failures, unsupported action types, permission failures, malformed payloads, and deterministic business-rule errors are permanent.

Use capped exponential backoff with jitter:
`delay = min(maxDelay, baseDelay * 2^(attemptNumber - 1)) + boundedJitter`

The scheduler must persist `next_retry_at`; never rely on an in-memory sleep as the durable retry mechanism.

## 7. Timeout contract

- Keep the current synchronous action execution limit conservative (proposed maximum 300 seconds pending product review).
- Align database constraint and runtime validator in one reviewed migration proposal.
- Inventory existing configured values above the chosen limit before migration.
- For operations that may exceed the synchronous cap, use asynchronous provider jobs with polling/webhooks, leases, cancellation, and resumable progress.
- Never claim that a synchronous JavaScript deadline can forcibly terminate arbitrary blocking code.

## 8. Concurrency and idempotency

- Claim work atomically with row locking / compare-and-set.
- Use a unique idempotency key for each logical step attempt.
- Keep attempt number separate from run claim generation.
- Persist the claim generation and reject writes from stale generations.
- Heartbeats extend leases only for the active lease token.
- Lease expiry makes work eligible for recovery; it does not prove the prior worker stopped.
- Side-effecting actions require provider-level idempotency or a deduplication/outbox strategy before automatic retries are enabled.

## 9. Security boundaries

- Verify Supabase identity server-side with `getUser(token)`.
- Derive owner from verified identity; ignore client-supplied owner identifiers.
- Check workflow ownership before loading steps or writing attempts.
- Worker-only RPCs remain inaccessible to browser roles.
- Keep service-role credentials in server-side function secrets only.
- Enforce payload, output, step-count, concurrency, and execution budgets.
- Redact credentials and sensitive values from logs.
- Allowlist action types; do not evaluate dynamic code, shell commands, or arbitrary URLs from untrusted inputs.
- Preserve tenant/owner isolation in every SELECT, INSERT, UPDATE, claim, and completion path.

## 10. Free-first implementation alternatives

| Option | Advantages | Trade-offs | Recommendation |
|---|---|---|---|
| PostgreSQL queue + Edge Function workers | Reuses current stack; durable state; low operational complexity | Need careful lease/retry implementation; execution duration bounded | **Preferred first release** |
| PostgreSQL queue + scheduled cron dispatcher | Reuses existing cron worker | Polling latency; scheduler secret lifecycle | Use for dispatch/recovery |
| External queue service | Rich delivery semantics | New vendor, quotas, cost and secrets | Defer until measured need |
| In-memory retry loop | Easy prototype | Lost on worker interruption; duplicates; no durable history | Reject for production |

## 11. Rollout strategy

1. Contract tests and synthetic fixtures only.
2. Additive schema proposal and compatibility inventory.
3. Isolated test project / disposable environment.
4. Shadow-read and compare behavior without executing side effects.
5. Controlled canary after explicit approval.
6. Monitor queue age, lease expiry, retry rate, dead-letter count, and failure classes.
7. Rollback plan for worker code and additive schema.
8. Production release only after human approval.

## 12. Acceptance criteria

- Retry limit has deterministic, tested semantics.
- Database/runtime timeout bounds match.
- Duplicate delivery does not duplicate a side effect.
- Expired leases recover work safely.
- Stale workers cannot overwrite newer attempts.
- Owner A cannot read, claim, modify, or complete Owner B work.
- Worker crash/restart preserves attempt history.
- Secrets and raw provider credentials never appear in client responses/logs.
- Queue and output limits are enforced.
- CI, isolated integration tests, security review, and release approval are recorded.

## 13. Explicit non-goals

No arbitrary-code execution, client-managed lifecycle fields, client-supplied owner IDs, automatic production migrations, service-role exposure, or implicit deployment.
