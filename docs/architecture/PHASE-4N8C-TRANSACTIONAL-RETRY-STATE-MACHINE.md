# Phase 4N.8C.3 — Transactional Retry and Recovery State Machine

**Status:** Architecture proposal only — NOT approved for migration or worker integration  
**Base:** `feat/phase-4n8c-workflow-reliability-pr35`  
**Production writes:** None  
**Database migration:** Not authored or applied  
**Worker retry integration:** Disabled

## 1. Evidence and current contract

The Phase 4N.8B migration defines `public.simula_transition_workflow_step`. It locks the parent `workflow_runs` row with `FOR UPDATE`, verifies owner, `status = 'running'`, and exact equality of the supplied `p_attempt` to `workflow_runs.attempt`. The function then writes to the existing `workflow_step_runs` row.

The `start` transition inserts or replaces the row only when the stored `workflow_step_runs.attempt` is lower than the supplied parent run attempt. The `succeed` and `fail` transitions require the matching row to be `running` at that same parent attempt.

Therefore:
- `workflow_step_runs.attempt` is currently the **workflow-run generation fence**.
- It is not an independent count of executions of an individual step.
- Reusing the existing `start` transition for a same-generation retry is rejected by design.
- Bumping `workflow_runs.attempt` to retry one step would invalidate the generation fence for the whole run.

Do not change these semantics in place.

## 2. Recommended model: append-only step-attempt ledger

Keep `workflow_step_runs` as the latest per-step projection / summary row. Add a separate append-only `workflow_step_attempts` ledger in a future, separately reviewed migration.

Proposed logical fields (names are design candidates, not an executable migration):
- `id` UUID primary key
- `run_id`, `step_id`, `owner_id` — identity and ownership scope
- `run_attempt` — parent workflow generation captured at claim time
- `step_attempt_number` — monotonically increasing attempt number within this run generation
- `status` — `scheduled | running | succeeded | failed | abandoned | outcome_unknown`
- `available_at` — earliest eligible claim time
- `lease_token_hash` — hash of a random lease token; never persist or log the raw token
- `lease_expires_at` — bounded lease deadline
- `idempotency_key` — stable identity for an intended side effect, unique in its documented scope
- `error_code`, `error_message` — bounded, sanitized failure metadata
- `started_at`, `finished_at`, `created_at`, `updated_at`

Required constraints and indexes to validate against the real schema before migration:
- Unique `(run_id, step_id, run_attempt, step_attempt_number)`.
- At most one active attempt per `(run_id, step_id, run_attempt)` using a partial unique index for active statuses.
- Foreign keys must preserve the existing workflow/run/step ownership relationship.
- Queue index begins with status and availability/lease expiry columns selected from measured query plans.
- Check constraints bound attempt numbers and ensure lease/status consistency.
- Retention and privacy policy for error metadata must be documented.

## 3. Transactional RPC contract

Do not grant clients direct write access to the attempt ledger. Expose narrowly scoped SECURITY DEFINER RPCs with a fixed empty search_path and explicit grants.

### A. Claim next step attempt

Input: run ID, step ID, owner ID, expected parent run generation, worker identity, and current time supplied/derived server-side.

Transaction:
1. Lock parent `workflow_runs` row with `FOR UPDATE`.
2. Verify owner, running state, and exact parent generation.
3. Lock/read the relevant step summary and latest attempt.
4. Reject if an unexpired active lease exists.
5. If a prior lease expired, move that attempt to `abandoned` or `outcome_unknown` according to action safety classification; do not assume it never executed.
6. Enforce retry limit and elapsed-time budget using persisted first-attempt time.
7. Insert the next attempt with a fresh cryptographically random lease token hash and bounded expiry.
8. Return the attempt ID and raw lease token once to the authorized worker; never log it.

### B. Complete or fail an attempt

Input includes attempt ID, parent run generation, worker lease token, and transition payload.

Transaction:
1. Lock the parent run row first, preserving the existing lock order.
2. Verify parent owner/status/generation.
3. Lock the attempt row.
4. Verify attempt is active, lease has not expired, and token hash matches using constant-time comparison where available.
5. Apply exactly one terminal transition; reject replayed or stale completion.
6. Update the `workflow_step_runs` projection only if its parent generation and current attempt identity still match.
7. Commit attempt and projection atomically.

### C. Schedule retry

A retry scheduler must not execute actions. It only transitions a failed, retryable attempt to a scheduled next attempt after policy approval. Persist `available_at`, retry count, first-attempt timestamp, and terminal reason atomically.

The existing pure policy module is advisory decision logic; the database RPC remains the authority for concurrency and durable limits.

## 4. Failure classification and retry rules

- Retry only allowlisted transient failures such as network timeout, rate limiting, selected upstream 5xx, and temporary worker capacity exhaustion.
- Never retry authorization, ownership, schema validation, invalid configuration, unsupported action, or deterministic business-rule errors.
- Treat unknown errors as non-retryable until classified.
- Use bounded exponential backoff with full jitter.
- Enforce both maximum retry count and maximum elapsed time in the database transaction, not only in worker memory.
- A timeout after sending an external request is an ambiguous outcome, not proof of failure.

## 5. External side effects: separate safety boundary

Database fencing cannot guarantee exactly-once remote execution. Before enabling external actions, require:
- a durable outbox row committed with the business transition;
- a stable downstream idempotency key;
- delivery-attempt tracking;
- explicit `outcome_unknown` state after ambiguous network outcomes;
- reconciliation/read-after-write or operator resolution;
- documented downstream idempotency guarantees and retention window.

If a downstream provider does not support idempotency or reliable reconciliation, do not automatically retry non-idempotent actions.

## 6. Recovery and lock-order invariants

- Parent run row is always locked before child attempt/step rows.
- Queue claim, stale recovery, step claim, and completion must use the same lock order.
- Parent run generation remains the top-level stale-worker fence.
- Per-step attempt number and lease token fence retries inside one parent generation.
- Recovery must atomically advance parent generation before any old worker can commit.
- Lease expiry alone does not authorize duplicate side effects; the action's idempotency/reconciliation contract must permit redelivery.
- All RPCs must be owner-scoped and unavailable to `anon` and `authenticated` unless a specific authenticated entry point is deliberately designed.

## 7. Required tests before implementation approval

Use a disposable local Supabase/PostgreSQL database only. Tests must invoke the actual RPCs, not manually mutate generation fields to simulate recovery.

1. Two concurrent claims for one step: exactly one active lease.
2. Duplicate completion: one success, replay rejected.
3. Expired lease + recovery: stale lease cannot complete.
4. Parent generation advances during worker execution: old generation cannot commit.
5. Retry limit boundary: no attempt beyond configured limit.
6. Elapsed-time boundary: no schedule beyond deadline.
7. Retry classification: deterministic and authorization errors never retry.
8. Lost claim response: retrying claim does not create a second active attempt.
9. Expired lease with external action outcome unknown: no blind redelivery.
10. Owner mismatch and cross-workflow step ID: rejected.
11. Concurrent recovery and completion: serializable outcome under the parent lock.
12. Privilege tests: service role only for internal state transitions.

CI must fail if the required disposable database fixture is missing. Keep fast unit tests separate from mandatory DB integration tests.

## 8. Alternatives considered

| Alternative | Assessment |
|---|---|
| Retry loop in worker memory | Reject: not durable; unsafe after crash; races across workers |
| Reuse `workflow_step_runs.attempt` | Reject: it is the parent run generation fence |
| Increment parent run generation for one step retry | Reject: invalidates all step fences in the run |
| Add retry columns only to `workflow_step_runs` | Possible minimal migration, but loses per-attempt audit history and complicates ambiguous outcomes |
| Append-only `workflow_step_attempts` ledger | **Recommended**: durable attempt history, independent step attempts, explicit lease and recovery state |
| External queue/orchestrator | Alternative future architecture; adds service/cost/operational dependency and still needs idempotency |

## 9. Approval gates

This document is a design artifact only. Before any migration or worker integration:
1. Inspect all current migrations, table constraints, indexes, RLS policies, queue claim RPCs, and stale recovery RPCs on the exact implementation base.
2. Confirm the current `workflow_step_runs` uniqueness and foreign-key definitions.
3. Review SQL lock ordering and transaction isolation.
4. Produce a migration diff and rollback/forward-repair plan.
5. Add SQL/RPC tests and required disposable DB CI.
6. Obtain explicit approval for the migration and test environment.

**Current decision:** continue with source-level design and pure unit tests only. No schema changes, production database access, deployment, or PR merge.
