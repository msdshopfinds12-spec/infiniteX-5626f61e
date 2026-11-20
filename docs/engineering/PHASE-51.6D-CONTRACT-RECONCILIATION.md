# Phase 51.6D — Contract Reconciliation Decision Record

**Status:** PROPOSED FOR REVIEW — DESIGN ONLY  
**Parent:** PR #63  
**Tracking:** Issue #68  
**Baseline:** `a67345d7be575cc43fbee6461c1cdfd3f8936134`  
**Branch:** `feat/phase-51-6d-contract-reconciliation`

This record converts the verified Phase 51.6 findings into explicit decisions before any executable persistence schema is authored. It is not a migration and must not be applied to Supabase.

## 1. Verified constraints carried forward

- `workflow_step_runs` has UNIQUE (`run_id`, `step_id`) and is a current-state projection, not immutable retry history.
- `workflow_runs.attempt` is a run claim generation; it is not a step attempt number.
- `workflow_steps.retry_limit` is constrained to 0–10. Maximum logical executions are therefore `1 + retry_limit`.
- The live timeout constraint is 1–3600 seconds; the inspected worker runtime validator is narrower at 1–300 seconds. Do not alter the live constraint in this phase.
- User-triggered and cron-triggered claim paths have distinct authentication and grants. They must remain distinct.
- Existing parent deletion behavior cascades through workflow execution rows. Retention cannot be promised beyond parent/user deletion without a separately approved privacy and retention policy.
- The Phase 51.6B TypeScript module is a deterministic domain model only. It does not provide distributed atomicity or persistence.

## 2. Proposed decisions for review

### D1 — Attempt row lifecycle

**Decision:** One ledger row represents exactly one execution attempt. Its state is `queued → running → succeeded|failed|cancelled`. Once terminal, it is immutable.

A retry never reopens a failed attempt. Retry scheduling is represented in the mutable per-step projection (or a dedicated schedule row); when due, the next immutable attempt row is inserted.

**Invariant:** `attempt_number` is 1-based and unique within (`run_id`, `step_id`). `retry_limit` counts retries after the initial attempt.

### D2 — Separate counters

Keep these concepts distinct and never overload one column:
- run claim generation: existing run-level worker claim generation;
- step attempt number: logical execution number for one run/step;
- delivery count: queue delivery/duplicate observation count, if needed;
- lease generation: monotonically increasing fencing token for the run/step execution slot.

**Decision:** Lease generation is monotonic per (`run_id`, `step_id`) across retries, not reset when a new attempt row is created. The current-state projection owns the authoritative counter. Each claim increments it atomically.

### D3 — Idempotency

**Internal attempt identity:** unique (`run_id`, `step_id`, `attempt_number`) plus a deterministic versioned key derived from those identifiers.

**Conflict rule:** if an insert collides on the same logical identity and the stored request fingerprint matches, return the existing attempt as an idempotent replay. If the fingerprint differs, fail with a stable conflict code; never silently reuse the prior result.

**External provider effects:** internal attempt idempotency is not provider idempotency. Keep external side-effect actions disabled until a provider-supported idempotency key or transactional outbox plus reconciliation protocol is designed and tested.

### D4 — Ownership and parent consistency

**Decision:** All attempt creation and state transitions occur only through trusted transaction functions. Each transaction validates the run → workflow → step relationship and owner identity before writing. User-facing paths derive owner identity from the verified JWT context; callers cannot choose an arbitrary owner ID. Internal cron execution remains service-role-only.

**Review requirement:** Compare transaction-time parent validation with composite foreign keys. Prefer database-enforced composite constraints if the existing schema can support them additively without unsafe table rewrites; otherwise require row locks and explicit parent consistency checks in every write transaction. Never trust denormalized owner IDs alone.

### D5 — Foreign keys, deletion, retention and privacy

**Decision:** Do not promise permanent audit retention. The initial additive ledger should follow the existing execution-data deletion boundary: deleting the owning workflow/user may delete associated attempt history, subject to explicit privacy policy.

Before migration, verify whether direct FK cascades are acceptable or whether a privacy-aware tombstone/purge function is required. Do not introduce indefinite retention, soft-delete bypasses, or cross-owner orphan records by default.

### D6 — Lease claim and fencing

**Decision:** Claim is one database transaction:
1. Lock the current per-step projection and candidate queued attempt.
2. Verify due time, run/step ownership, cancellation state, and retry budget.
3. Increment the per-step lease generation.
4. Set the attempt to running with that generation and lease timestamps.
5. Commit and return the generation to the worker.

Heartbeat and completion must compare the exact generation and active state in the same transaction. A stale generation updates zero rows and is treated as a lost lease.

Lease expiry permits recovery; it does not itself prove the previous worker stopped. Fencing prevents stale database writes. External effects still require provider idempotency/outbox protection.

### D7 — Cancellation versus completion

**Decision:** Serialize both transitions by locking the same authoritative per-step projection row and applying a conditional state transition. The first valid transaction to commit wins. The loser observes the terminal state and performs no write.

Do not use application timestamps or client-side race ordering as the arbiter. Use database transaction order and state predicates.

### D8 — Retry scheduling

**Decision:** Persist `next_attempt_at` on the current-state projection or dedicated schedule row. Workers must not sleep in memory for retry delays. A due retry creates a new attempt row with the next attempt number and stable logical idempotency identity.

Only explicit transient failures retry. Unknown, malformed, permanent, and cancelled failure classes fail closed. Backoff remains bounded and deterministic under injected test randomness.

### D9 — Timeout policy

**Decision:** Preserve the live database constraint (1–3600 seconds) during this phase. Preserve the currently inspected runtime maximum (300 seconds) until a product-level timeout decision and worker behavior tests justify a change. The runtime must reject values outside its effective supported range even if the database accepts a wider range.

Do not describe the cooperative step-budget helper as hard preemption: it cannot interrupt synchronous blocking code.

### D10 — Append-only enforcement

**Decision:** Application roles receive no direct UPDATE/DELETE privileges on the attempt ledger. Inserts and permitted state transitions are mediated by narrowly scoped database functions. Terminal rows cannot be updated. Any required privacy purge is a separately reviewed privileged operation with explicit audit semantics.

Verify function owner, fixed search_path, execute grants, RLS behavior, and service-role boundaries in the disposable harness before proposing production privileges.

## 3. Proposed persistence shape (not executable SQL)

- `workflow_step_attempts`: immutable identity and execution history; one row per execution.
- Existing `workflow_step_runs` or a reviewed successor projection: current step state, next attempt schedule, and authoritative lease generation.
- Optional outbox table: only if/when external side effects are introduced; not required for the current local JSON-only action allowlist.

No production table or RPC is created by this document.

## 4. Transaction contract to test in disposable PostgreSQL

| Operation | Atomic preconditions | Expected result |
|---|---|---|
| create attempt | owner/run/workflow/step match; attempt number unused | one queued row or idempotent replay |
| claim | queued, due, not cancelled, retry budget available | one running row with incremented fencing generation |
| heartbeat | running and exact generation matches; lease not expired | monotonic heartbeat/expiry update |
| finish success/failure | running, exact generation, lease valid | one terminal transition |
| schedule retry | failed transient attempt; retry budget remains | projection schedule; prior attempt unchanged |
| materialize retry | schedule due; next attempt absent | exactly one new queued attempt |
| cancel | nonterminal projection/attempt | terminal cancellation wins or observes already terminal |
| recover | lease expired and generation still current | safe requeue/new generation; stale worker fenced |

## 5. Disposable PostgreSQL harness requirements

- GitHub Actions service container only; no production Supabase URL, token, or secret.
- Pin a PostgreSQL major version consistent with the verified production major (17); use a health check.
- Synthetic schema must be clearly labeled and must not masquerade as a replay of production migrations.
- Apply schema from an empty disposable database; verify constraints, indexes, transaction behavior, and rollback.
- Concurrency tests must use independent database connections/processes, not only sequential unit tests.
- Owner A/B tests must prove cross-owner reads/writes are denied at the database boundary.
- CI logs must never print credentials. Use ephemeral service credentials only.
- Keep external provider effects disabled.

## 6. Open review questions — block executable migration until resolved

- Confirm exact authoritative migration files and provenance for every workflow table, trigger, index, policy, and claim/recovery function.
- Decide whether parent-consistency composite unique keys can be added safely or whether transaction-time locked validation is the accepted first implementation.
- Confirm privacy/legal retention behavior for attempt history on user/workflow deletion.
- Confirm whether request fingerprint is stable across retries or must include a versioned normalized action payload.
- Confirm whether attempt lease duration and heartbeat cadence are step-specific or use a single bounded worker policy.
- Confirm how an expired running attempt becomes retryable without mutating its immutable history.
- Confirm whether run cancellation is authoritative over all pending/running steps and how terminal run state is derived.

## 7. Acceptance gates

- [ ] This decision record reviewed and approved.
- [ ] Migration provenance and all consumers inventoried.
- [ ] Disposable PostgreSQL schema explicitly marked synthetic.
- [ ] Atomic claim, fencing, retry, cancellation and completion race tests pass.
- [ ] Owner A/B isolation tests pass.
- [ ] Rollback/forward-fix strategy tested.
- [ ] Exact commit SHA and CI evidence recorded.
- [ ] No production DDL/DML, grants, RLS changes, RPC calls, deployments, merge or release without separate explicit approval.

## 8. Safety boundary

This branch is documentation/design only. No production database access, DDL/DML, migration application, grants/revokes, RLS changes, secrets, provider integrations, deployment, merge, or release is authorized.
