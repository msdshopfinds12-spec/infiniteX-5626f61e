# Phase 51.3 — Durable Step Attempt Ledger Contract

**Status:** Design-only; no migration or production changes  
**Parent:** Phase 51 Draft PR #63  
**Evidence baseline:** Phase 51.1 read-only database verification (2026-11-20)  
**Implementation status:** NOT IMPLEMENTED

## 1. Purpose and invariants

Define durable per-step attempt identity without overloading existing run-generation counters or overwriting execution history.

1. One logical step attempt has one stable identity and monotonically increasing attempt number.
2. A retry creates a new attempt row; it never reuses or overwrites a prior attempt row.
3. The existing current-state row is a projection, not the historical source of truth.
4. A worker may transition an attempt only while holding the current lease and fencing generation.
5. Duplicate delivery cannot create another logical attempt or repeat a side effect.
6. Ownership is derived and checked server-side. Client-supplied owner IDs are never authoritative.
7. Terminal attempts are immutable under normal application roles.
8. Queue, attempt ledger, idempotency record, and state projection are updated transactionally.
9. Unknown or unclassified errors fail closed as permanent.
10. No schema choice is applied until frontend, worker, RPC, RLS, grants, FK, and populated-data dependencies are reviewed.

## 2. Verified database constraints

Phase 51.1 read-only catalog inspection established:

- workflow_runs has UUID id, owner_id, workflow_id, status, and attempt. The existing attempt is a run-claim/generation counter.
- workflow_step_runs has UUID id, run_id, step_id, owner_id, status, and attempt, with UNIQUE (run_id, step_id).
- workflow_steps.retry_limit is constrained to 0–10.
- workflow_steps.timeout_seconds is constrained to 1–3600.
- No workflow, run, or step-run rows existed at inspection time; populated-data migration compatibility is unknown.
- Existing authenticated and service-role grants differ. Internal cross-owner queue claim is service-worker-only.

Consequences:
- Do not reinterpret either existing attempt field as the new logical step attempt number.
- Do not implement retry history by repeatedly updating the unique current-state row.
- Do not assume composite foreign keys or uniqueness constraints that were not verified.
- A zero-row snapshot does not prove migration safety for future or externally written data.

## 3. Keep counters separate

| Identifier | Meaning | Authority |
|---|---|---|
| workflow_runs.attempt | Run-claim generation/fencing value | Trusted claim function |
| workflow_step_attempts.attempt_number | 1-based logical execution attempt for one run + step | Trusted attempt-creation transaction |
| Queue delivery count | Delivery/claim/recovery events | Worker telemetry/queue contract |
| Lease generation | Monotonic fencing generation for a lease scope | Trusted lease-claim transaction |

Never derive one counter from another or display them under the same UI label.

## 4. Proposed logical data model

This is a logical contract, not executable SQL. Exact FK targets and delete actions require fresh schema review before migration authoring.

### 4.1 workflow_step_attempts — per-attempt record

| Field | Logical type | Contract |
|---|---|---|
| id | UUID | Server-generated primary key |
| run_id | UUID | References owning workflow run |
| step_id | UUID | References configured workflow step |
| owner_id | UUID | Server-derived; must match run/workflow ownership |
| attempt_number | integer | 1-based; unique and monotonic per (run, step) |
| status | enum/text check | queued, running, retry_wait, succeeded, failed, cancelled |
| idempotency_key | text | Server-scoped stable key for this logical attempt |
| request_fingerprint | text | Hash of canonical validated action/input contract |
| lease_generation | bigint | Fencing generation accepted for this attempt |
| started_at | timestamptz | Set by trusted claim |
| finished_at | timestamptz nullable | Set on terminal transition |
| next_attempt_at | timestamptz nullable | Persisted retry due time; required only in retry_wait |
| failure_class | text nullable | Normalized allowlisted classification |
| error_code | text nullable | Stable safe code; no raw exception or credential |
| output_json | jsonb nullable | Validated, bounded, redacted result projection |
| created_at | timestamptz | Server timestamp |

Required logical constraints:

- Primary key on id.
- Unique (run_id, step_id, attempt_number).
- Unique idempotency scope, preferably (owner_id, idempotency_key); exact scope must align with enqueue and provider idempotency semantics.
- attempt_number >= 1.
- State/time consistency: retry_wait requires next_attempt_at; terminal states require finished_at; non-terminal states must not claim terminal completion.
- run_id, step_id, owner_id, attempt_number, idempotency_key, and request_fingerprint are immutable after creation.
- Terminal status and terminal result/error fields cannot be changed by normal worker APIs.
- No client role receives direct INSERT/UPDATE/DELETE on this ledger.

### 4.2 Referential integrity and tenant consistency

Do not guess composite FK availability. Before SQL is authored, inspect deployed primary/unique keys and delete actions for workflow_runs, workflow_steps, and workflows.

Two acceptable patterns:

**Preferred if compatible keys can be added safely:** composite uniqueness/FKs that enforce run-owner and step/workflow consistency in PostgreSQL.

**Fallback if additive composite constraints are too risky:** a single trusted SECURITY DEFINER transaction/RPC locks and verifies run, workflow, step, and owner relationships before creating or transitioning an attempt. Re-check relationships on every write path; never trust only a prior read.

Do not cascade-delete historical attempts merely because a workflow is deleted without an explicit retention and audit decision. Existing run/step FK delete behavior must be reviewed before choosing final delete actions.

### 4.3 workflow_step_runs — current-state projection

Keep the existing one-row-per-(run, step) concept as a summary for efficient UI reads if useful.

- It represents latest known state, not immutable history.
- It may point to current_attempt_id after compatibility review.
- It is updated in the same transaction as attempt transitions.
- It must never be the sole evidence of prior retries.
- Existing columns and consumers must be inventoried before changing fields.

### 4.4 Lease model

Prefer a separate lease relation or narrowly scoped lease record if modifying workflow_runs creates compatibility risk.

Logical fields: lease scope (run or step attempt), worker identity (non-secret stable identifier), secret lease-token hash (never raw token), monotonically increasing generation, leased_until, heartbeat_at, created_at, and updated_at.

The raw lease token is returned only to the trusted worker at claim time and never stored or returned to the browser. Store a cryptographic hash and compare inside the trusted server boundary. Lease expiry makes work eligible for recovery; it does not prove the old worker stopped.

Use fencing generation in every completion, heartbeat, and failure write. A stale worker must affect zero rows and receive a normalized stale-lease result.

## 5. Attempt lifecycle

Allowed transitions:

| Current | Next | Condition |
|---|---|---|
| queued | running | Atomic claim succeeds; active lease created |
| running | succeeded | Current lease + generation; validated output |
| running | retry_wait | Explicit transient classification and retry budget remains |
| retry_wait | running | Due time reached; atomic reclaim succeeds |
| running | failed | Permanent error, exhausted retry budget, or policy terminal |
| queued/retry_wait | cancelled | Trusted cancellation wins compare-and-set |
| running | cancelled | Trusted cancellation wins and executor can safely stop/mark cancellation |

Terminal states are succeeded, failed, and cancelled. No terminal state may transition back to running. A retry creates a new row with the next attempt number; it does not transition the old failed attempt back to queued.

A completion transaction must atomically verify:
1. attempt ID matches;
2. attempt is still running;
3. lease token hash and generation match the active lease;
4. lease has not been superseded;
5. run and step still belong to the verified owner;
6. cancellation has not already won;
7. output passes schema, size, and redaction validation.

If any predicate fails, perform no state mutation.

## 6. Retry policy contract

- retry_limit counts retries after the initial attempt.
- Maximum logical attempts = 1 + retry_limit.
- Attempt numbers are 1-based.
- Retry only explicitly classified transient failures.
- Permanent, cancelled, validation, authorization, unsupported-action, and unknown failures are not retried.
- Use capped exponential backoff with multiplicative bounded jitter, matching the current pure helper:

  rawDelay = min(maxDelayMs, baseDelayMs * 2^(attemptNumber - 1))

  delay = min(maxDelayMs, round(rawDelay * (1 - jitterRatio + 2 * jitterRatio * random())))

- Persist next_attempt_at; do not sleep in memory as the retry source of truth.
- Apply a maximum retry delay and maximum attempt count.
- Provider side effects are non-retryable until provider idempotency or durable outbox/deduplication is implemented.
- Unknown failure classifications map to permanent, never transient.

### 6.1 Documentation consistency correction

The earlier architecture document described additive bounded jitter while the implemented pure helper applies multiplicative jitter. The formula above is the current code contract. Architecture documentation must use one formula consistently before runtime wiring.

## 7. Idempotency and duplicate delivery

Two distinct layers are required:

1. Enqueue idempotency prevents duplicate logical workflow runs from repeated client submissions.
2. Attempt idempotency prevents duplicate creation/execution of the same logical step attempt after redelivery or worker restart.

Contract:

- Generate idempotency keys server-side from stable logical identifiers, or accept a client request key only as opaque untrusted input subject to strict format/length and owner scoping.
- Bind a key to a canonical request fingerprint. Reuse with the same fingerprint returns the existing logical result; reuse with a different fingerprint returns conflict and does not mutate data.
- Enforce uniqueness in the database, not with read-before-write alone.
- Attempt creation, state projection, and outbox insertion (if required) occur in one transaction.
- A unique conflict is a normal duplicate path, not a worker crash.
- For external side effects, send a stable provider idempotency key when supported. If unsupported, use an outbox plus provider-specific reconciliation; otherwise automatic retries remain disabled for that action.

## 8. Trusted transaction/API responsibilities

Recommended trusted operations (names are illustrative):

- enqueue_workflow_run: verify caller identity and workflow ownership, validate minimal request, enforce enqueue idempotency, insert queued run.
- claim_due_step_attempts: service-worker-only; atomically claim due attempts, issue lease, increment fencing generation.
- complete_step_attempt: service-worker-only; validate lease/generation and output, transition terminal state, update summary projection.
- schedule_step_retry: service-worker-only; classify error, enforce retry budget, persist due time and safe error metadata.
- cancel_workflow_run: authenticated owner request; verify owner and use compare-and-set; keep internal worker cancellation separate.
- recover_expired_leases: service-worker-only; reclaim expired leases and fence old generations.

All operations that change attempt, lease, run, or projection state must be atomic database transactions. Browser-facing endpoints call narrow owner-checked operations and never expose service-role credentials or internal queue claim functions.

## 9. Indexing and operational query contract

Candidate indexes, subject to EXPLAIN and representative synthetic load:

- unique (run_id, step_id, attempt_number);
- unique owner-scoped idempotency key;
- partial due-work index for retry_wait ordered by next_attempt_at;
- active-lease expiry index for non-terminal leases ordered by leased_until;
- owner-scoped history index ordered by created_at DESC.

Avoid speculative indexes. Validate query plans and write amplification before applying. Exact names and predicates are implementation decisions after schema and query plans are reviewed.

## 10. RLS, grants, and trusted worker boundary

- Enable RLS on any new owner-scoped table.
- Browser users may read only safe owner-scoped projections/history as product requirements allow.
- Browser users must not directly create attempts, set attempt numbers, set lease data, schedule retries, complete work, or mutate terminal states.
- Internal cross-owner claim/recovery is service-role-only and must not be executable by anon/authenticated.
- SECURITY DEFINER functions use fixed/empty search_path, schema-qualified objects, strict argument validation, and least-privilege EXECUTE grants.
- Verify every grant and RLS policy from catalog after migration in a disposable environment.
- Test synthetic Owner A/Owner B isolation, forged IDs, and concurrent claims.

## 11. Payload, privacy, and observability

- Validate action input/output against allowlisted schemas.
- Set explicit byte limits for input, output, error metadata, and step count.
- Persist normalized error code/class only; redact tokens, credentials, key hashes, authorization headers, and sensitive provider payloads.
- Do not persist raw exception stacks or arbitrary provider responses in user-readable columns.
- Correlate run ID, step ID, attempt ID, lease generation, and trace ID in structured logs.
- Logs must not contain raw lease tokens or service credentials.
- Metrics: queue age, due retry count, active/expired leases, retry rate, exhausted retries, stale-write rejections, duplicate deliveries, action duration, and dead-letter count.

## 12. Migration and rollout gates

Before migration authoring:
- [ ] Re-read live schema, constraints, FKs, grants, policies, and function definitions.
- [ ] Inventory frontend/API/worker consumers of current run and step-run fields.
- [ ] Decide whether lease is run-scoped or step-attempt-scoped.
- [ ] Decide idempotency-key scope and request canonicalization.
- [ ] Decide retention and deletion semantics for attempt history.
- [ ] Reconcile runtime timeout range with database 1–3600 constraint and product limits.
- [ ] Confirm status vocabulary and cancellation semantics.
- [ ] Review additive FK/index strategy and lock duration.
- [ ] Define rollback and forward-fix plan.

Before production release:
- [ ] Apply only in a disposable Supabase project first.
- [ ] Test migration idempotency in a controlled environment.
- [ ] Run unit, RLS, grant, concurrency, duplicate-delivery, stale-worker, crash-recovery, and cancellation tests.
- [ ] Verify EXPLAIN plans with representative synthetic volume.
- [ ] Confirm no secrets or cross-owner data leak in API/log output.
- [ ] Obtain explicit human approval for production migration and deployment.

## 13. Alternatives and decision

| Design | Benefits | Risks | Decision |
|---|---|---|---|
| Append-only per-attempt ledger + current-state projection | Auditable retries; preserves existing UI read model | Additional table and transactional complexity | **Preferred** |
| Reuse one workflow_step_runs row for every retry | Minimal schema change | Destroys attempt history; ambiguous counters | Reject |
| External queue vendor | Mature delivery primitives | New account, quota, cost, secrets, vendor dependency | Defer until measured scale requires it |
| In-memory retry loop | Small prototype | Lost retries on interruption; duplicate side effects; no durable schedule | Reject for production |
| Fully event-sourced workflow engine | Strong history and replay model | Highest implementation/operational complexity | Defer; unjustified at current scale |

## 14. Verification status

| Area | Status |
|---|---|
| Existing table keys/constraints and grants | VERIFIED by Phase 51.1 catalog inspection |
| Current step retry ledger | NOT IMPLEMENTED |
| Proposed logical attempt contract | DOCUMENTED / DESIGN ONLY |
| Migration compatibility with populated rows | BLOCKED / no populated rows existed at inspection |
| Runtime worker integration | NOT IMPLEMENTED |
| Idempotent external side effects | NOT VERIFIED |
| Synthetic multi-owner integration suite | NOT TESTED |
| Production migration/deployment | NOT AUTHORIZED |

## 15. Safety statement

This document is design-only. No SQL migration, DDL, DML, grants, revokes, RLS changes, function invocation, production data mutation, secret change, deployment, merge, or release is included or authorized.
