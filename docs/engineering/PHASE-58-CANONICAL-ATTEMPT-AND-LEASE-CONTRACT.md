# Phase 58 — Canonical Durable Attempt and Lease Contract

**Status:** Design reconciliation proposal; not executable SQL  
**Related:** Issues #84 and #86; PRs #63, #70, #79, #81  
**Decision scope:** Logical lifecycle, atomicity, idempotency, worker fencing, and acceptance tests  
**Hard gate:** Reviewed live Schema Contract V2 and independent SQL review are still required before migration authoring.

## 1. Executive decision

Adopt **immutable execution attempts** as the canonical domain model:

- One attempt row represents exactly one execution.
- An attempt moves from `queued` to `running`, then to one terminal state: `succeeded`, `failed`, or `cancelled`.
- A failed attempt is never reopened or rewritten as a later retry.
- A retry creates a new attempt row with the next 1-based attempt number and a persisted future `scheduled_at`.
- The existing `workflow_step_runs` row remains a latest-state projection only; it is not the attempt history.
- Lease and fencing state is a separate concurrency concern and must be enforced transactionally in PostgreSQL.
- The browser never writes attempt, lease, queue, owner, or run lifecycle state directly.

This reconciles the later Phase 51.6B pure-domain contract with the intended append-only history model.

## 2. Conflict resolution across existing documents

The existing Phase 51.3 document describes `retry_wait` as an attempt status. The later Phase 51.6B domain document says retry_wait is not an attempt status: a failed execution remains terminal and the next execution is a new queued attempt.

**Canonical resolution:** remove `retry_wait` from the attempt lifecycle. A retry delay is represented by the next attempt's immutable `scheduled_at` value while that attempt remains `queued`. The due-claim operation selects only queued attempts whose schedule is due.

The Phase 51.3 draft schema and transition table are not executable authority. They must be reconciled to this document before any persistence implementation.

## 3. Distinct counters and identities

| Value | Meaning | Must not be confused with |
|---|---|---|
| Run claim generation | Fencing generation for a run-level claim | Logical step attempt number |
| Step attempt number | 1-based execution number for one run + step | Queue delivery count |
| Lease generation | Monotonic generation for a lease scope | Attempt number |
| Delivery count | Transport/scheduler redelivery telemetry | A new logical attempt |
| Attempt ID | Stable identity of one execution | Run ID or step ID |
| Idempotency key | Stable deduplication identity for a logical request/action | Authentication token |

Retry limit N means at most N retries after the initial attempt; maximum logical executions = 1 + N. Existing `workflow_runs.attempt` and `workflow_step_runs.attempt` must not be reinterpreted without a separately reviewed compatibility decision.

## 4. Canonical attempt lifecycle

Allowed transitions:

| Current | Next | Preconditions |
|---|---|---|
| queued | running | Schedule due; trusted atomic claim; lease issued |
| running | succeeded | Current lease/fencing generation; validated bounded output |
| running | failed | Current lease/fencing generation; permanent or exhausted failure |
| running | cancelled | Authorized cancellation arbitration succeeds |
| queued | cancelled | Authorized cancellation compare-and-set succeeds |

Terminal states never transition again.

### Retry creation

When a running attempt fails with an explicitly retryable error and retry budget remains, one database transaction must:

1. Verify the attempt is still running under the current lease token hash and fencing generation.
2. Normalize and classify the failure; unknown classifications are permanent.
3. Mark the current attempt terminal `failed`, with safe normalized error metadata.
4. Insert exactly one next attempt with the next attempt number, a new attempt ID, stable scoped idempotency identity, and `scheduled_at = transaction_time + bounded_backoff`.
5. Update the current-state projection to the next queued attempt.
6. Insert any required outbox/scheduler notification in the same transaction.
7. Commit all or none.

The unique attempt identity constraint is the final defense against duplicate retry creation. A retry is not a second delivery of the failed attempt and must never mutate its history.

If the retry budget is exhausted, mark the current attempt failed and update the projection to terminal failure in the same transaction. No next attempt is inserted.

## 5. Backoff and failure taxonomy

The current pure retry helper uses capped multiplicative jitter:

`rawDelay = min(maxDelayMs, baseDelayMs * 2^(attemptNumber - 1))`

`delay = min(maxDelayMs, round(rawDelay * (1 - jitterRatio + 2 * jitterRatio * random())))`

Use injected randomness for deterministic tests. Persist the computed due time; never rely on an in-memory sleep as the source of truth.

Failure classes must be explicit and allowlisted:
- transient infrastructure/network failure;
- provider rate limit (only when provider idempotency/reconciliation is supported);
- timeout (policy-dependent and bounded);
- permanent validation/schema error;
- authorization/permission error;
- unsupported action or configuration error;
- cancellation;
- unknown/unclassified.

Only explicit transient classes are retryable. Unknown, permission, validation, unsupported-action, and cancellation outcomes fail closed. Automatic retries for external side effects remain disabled until provider idempotency keys or a transactional outbox plus reconciliation are implemented.

## 6. Lease, heartbeat, fencing, and recovery

A lease is not proof that the previous worker stopped. Expiry only makes work eligible for recovery.

The trusted claim operation must atomically:
- lock or conditionally claim a due queued attempt;
- issue a new monotonically increasing lease generation;
- create/update the active lease record;
- return the raw lease secret only to the trusted worker;
- store only a cryptographic token hash, never the raw token.

Every heartbeat, completion, failure, retry scheduling, and cancellation arbitration write must validate:
- attempt identity;
- active lease token hash;
- exact current fencing generation;
- lease validity/expiry policy;
- run/step/owner relationship;
- expected current status;
- cancellation state.

A stale worker must update zero rows and receive a normalized stale-lease outcome. Recovery creates a new generation before new work is allowed. The old generation can never write after fencing.

Lease storage shape, FK strategy, lock order, grants, and exact expiry semantics remain subject to the reviewed live V2 catalog and independent SQL review.

## 7. Current-state projection

The existing `workflow_step_runs` unique key `(run_id, step_id)` is compatible with a one-row current-state projection, not append-only history.

If retained:
- update it in the same transaction as attempt creation/transition;
- record the current attempt reference only after FK and compatibility review;
- expose only safe summary fields to owner-scoped reads;
- never use it as the sole audit history;
- inventory every frontend/API/worker consumer before changing its shape.

Do not add a guessed FK or alter current uniqueness before reviewing the complete V2 schema, existing data, delete actions, grants, triggers, and dependent functions.

## 8. Idempotency boundaries

There are at least three separate idempotency problems:

1. **Enqueue idempotency:** repeated client submission must resolve to one logical workflow run.
2. **Attempt creation idempotency:** duplicate failure delivery or transaction replay must not create two next attempts.
3. **External side-effect idempotency:** repeated worker execution must not duplicate provider/tool effects.

For all keys:
- scope to the verified owner and logical operation;
- bind key to a canonical request fingerprint;
- same key + same fingerprint returns the same logical result;
- same key + different fingerprint returns conflict without mutation;
- enforce uniqueness in the database, not read-before-write alone;
- never expose service credentials or raw lease secrets to the browser.

For external providers without idempotency support, keep automatic retry disabled until an outbox/reconciliation strategy is proven.

## 9. Trusted transaction boundaries

The final operation names are implementation details, but responsibilities must remain narrow:

- enqueue: verified identity, owner-scoped workflow, request validation, unique idempotency, queued run creation;
- claim: service-worker-only due attempt claim and lease issuance;
- heartbeat: current lease/generation only;
- complete: current lease/generation, bounded output validation, terminal transition, projection update;
- fail/schedule retry: classification, retry budget, immutable failure, atomic next-attempt creation and projection/outbox update;
- cancel: authenticated owner authorization and compare-and-set arbitration;
- recover: service-worker-only expired-lease detection and generation fencing.

Use security-definer functions only when necessary. Fix search_path, revoke default/public execution, grant execute to the narrowest role, validate every input, and ensure the function cannot be used as a cross-owner oracle. Exact role names and grants must come from reviewed catalog evidence, not assumptions.

## 10. Required disposable PostgreSQL acceptance tests

### Lifecycle and retry
- retry_limit 0: first retryable failure is terminal; no next attempt.
- retry_limit 1: at most one new attempt after initial execution.
- retry_limit N: exactly bounded to N retries after initial execution.
- Permanent and unknown failures never retry.
- Each retry gets a distinct attempt ID and next sequential attempt number.
- Prior terminal attempt rows remain unchanged.
- Future scheduled attempts cannot be claimed early.
- Due attempts can be claimed once.

### Concurrency and idempotency
- Two workers claim the same due attempt: exactly one wins.
- Duplicate failure delivery creates one next attempt.
- Same idempotency key/fingerprint returns same result.
- Same key with a different fingerprint conflicts and performs no write.
- Concurrent enqueue duplicates create one logical run.
- Projection, attempt, and outbox are all-or-nothing.

### Lease and recovery
- Old worker heartbeat after lease expiry is rejected.
- Old worker completion after a newer generation is rejected.
- Expired lease is recovered once under concurrent recovery workers.
- Worker crash after claim is recoverable.
- Cancellation racing completion has exactly one winning terminal transition.
- Graceful shutdown leaves work safely recoverable.

### Isolation and privilege
- Owner A cannot read, enqueue, claim, cancel, heartbeat, complete, or fail Owner B work.
- Browser/authenticated role cannot call internal worker claim/recovery operations.
- Service worker cannot bypass the owner/workflow/step relationship checks.
- No raw lease token, service key, stack trace, or secret appears in DTOs/logs.
- Terminal attempt history is immutable to normal application roles.

## 11. Implementation gates and exact sequence

1. Independently review PR #70/#81 read-only catalog SQL, validator and scope.
2. Obtain explicit authorization for a fresh read-only capture from the intended hosted project using least-privilege credentials.
3. Verify project identity out-of-band and review V2 metadata; never infer identity from database name.
4. Human-review the V2 capture and compare it with recovered migration history.
5. Reconcile the Phase 51.3 and Phase 51.6B docs, TypeScript domain, tests and worker state machine to this canonical lifecycle.
6. Design additive schema and RPCs from the reviewed V2 snapshot only.
7. Implement on a disposable PostgreSQL 17 fixture; test migration from the recovered baseline and populated synthetic data.
8. Prove all concurrency, fencing, idempotency, owner isolation and recovery tests.
9. Integrate both worker entry points through the same trusted orchestration/persistence adapter.
10. Keep enqueue at HTTP 501 and provider actions disabled until independent review approves the entire exact-SHA chain.
11. Human approval before any hosted migration, deployment, or production enablement.

## 12. Explicit non-claims

This document is a logical design reconciliation. It is not a migration, schema snapshot, implementation, proof of hosted parity, or production approval. It does not establish exact FK names, delete actions, indexes, grants, policies, trigger behavior, or function signatures.

No production database access, DDL/DML, migration, enqueue enablement, provider execution, deployment, merge, or billing change is authorized by this document.
