# Phase 51.6B — Pure Step Attempt and Lease Domain

**Status:** Implemented as runtime-neutral TypeScript domain code; persistence wiring NOT IMPLEMENTED.  
**Parent:** Phase 51 Draft PR #63  
**Scope:** Deterministic lifecycle, retry planning, lease fencing and cancellation rules.

## Domain invariants

- A step attempt is one execution. Its status is `queued`, `running`, or terminal: `succeeded`, `failed`, `cancelled`.
- A failed attempt is never reopened. A retry creates a distinct queued attempt with the next 1-based attempt number and a new attempt identity.
- `retry_limit` counts retries after the initial execution; maximum executions are `1 + retry_limit`.
- Run claim generation, logical step attempt number, queue delivery count, and lease fencing generation are distinct counters.
- Claim requires a due queued attempt and exactly the next fencing generation.
- Heartbeat and completion require the current generation and an unexpired lease. A stale worker is rejected.
- Terminal attempts cannot be transitioned again.
- Only explicitly classified transient failures can be retried. Permanent, cancelled, and unknown failures fail closed.
- Cancellation is terminal in the domain model; the API/persistence adapter must separately authorize the owner and atomically arbitrate cancellation against completion.
- Idempotency keys and request fingerprints are carried as immutable attempt identity. Database uniqueness and canonical request validation remain persistence responsibilities.

## Why retry_wait is not an attempt status

The previous ledger proposal mixed two concepts: an immutable execution record and a mutable retry schedule. The corrected model stores each completed execution as terminal `failed`; the next execution is a new `queued` row with `scheduledAtMs` set to the persisted due time. A future database adapter may keep a separate schedule/projection state, but must not reopen or reuse the prior attempt row.

## Lease fencing boundary

The TypeScript helpers validate compare-and-set preconditions but do not provide distributed concurrency control. A production adapter must implement the same checks in one database transaction, lock the attempt/lease row, increment generation atomically, and make completion/heartbeat updates conditional on both the current generation and active lease. The lease token itself is intentionally absent from this domain model; token generation, hashing, secret handling, and worker authentication belong in the trusted runtime boundary.

## External side effects

This domain layer does not execute provider calls. Automatic retries for non-idempotent external side effects remain disabled until a provider idempotency key or transactional outbox plus reconciliation is implemented.

## Verification boundary

Unit tests exercise pure state rules with synthetic data. They do not prove SQL transaction isolation, RLS, grants, worker authentication, durable scheduling, process-crash recovery, or provider idempotency. Those remain blocked until a disposable PostgreSQL/Supabase implementation and integration suite exist.
