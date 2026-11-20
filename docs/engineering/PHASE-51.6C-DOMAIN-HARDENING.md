# Phase 51.6C — Attempt Ledger Domain Hardening

**Status:** Domain implementation and regression coverage committed to PR #63. CI verification is pending for the new head.  
**Scope:** Pure TypeScript domain behavior only. No database schema, RPC, Edge Function deployment, production data, secrets, or billing changes.

## Implemented invariants

### Immutable output snapshots
- Successful output is restricted to JSON-compatible values.
- Output is copied into a detached snapshot and recursively frozen before it is attached to a terminal attempt. Attempt records returned by domain transitions are also runtime-frozen at the top level.
- Accessors are rejected without invoking getters.
- Functions, symbols, bigint, undefined, non-finite numbers, exotic prototypes, cycles, sparse arrays, symbol keys, and non-enumerable/accessor properties fail closed.
- Resource limits bound nesting depth, node count, and serialized character count.
- This is structural validation, not application-specific business-schema validation. A trusted step definition must still validate its own output contract before persistence.

### Canonical retry identity
- Retry idempotency keys are derived from a versioned canonical function of run ID, step ID, and logical attempt number. Initial queued attempts are also required to use that exact canonical key.
- Retry key generation no longer recursively appends suffixes to a previous key.
- The persistence adapter must enforce uniqueness and reject a reused key whose request fingerprint differs. A pure helper cannot enforce distributed deduplication.

### Timestamp consistency
- Heartbeats cannot move earlier than the previous heartbeat, and a heartbeat with a shorter requested duration cannot shorten an already-active lease.
- Completion cannot precede the last heartbeat.
- Cancellation cannot precede the scheduled time for queued attempts or the last lifecycle timestamp for running attempts.
- Lease expiry arithmetic remains guarded against unsafe integer overflow.

### Attempt history and retry semantics
- Terminal attempts remain immutable.
- A retry creates a distinct queued attempt with the next logical attempt number.
- retry_limit continues to mean retries after the initial attempt.

## Verification matrix

| Area | Domain coverage | Runtime/persistence coverage |
|---|---|---|
| Output immutability | Deep copy/freeze regression tests | NOT TESTED |
| JSON shape and resource limits | Invalid values, cycles, accessors, sparse arrays, depth and size tests | NOT TESTED |
| Canonical idempotency | Deterministic key tests | Database uniqueness/fingerprint enforcement NOT IMPLEMENTED |
| Lease fencing | Generation and expiry checks | Atomic SQL compare-and-set NOT IMPLEMENTED |
| Timestamp ordering | Heartbeat, completion and cancellation regressions | Cross-worker clock policy NOT IMPLEMENTED |
| Duplicate claims and cancellation races | Pure state predicates only | Multi-connection integration tests NOT IMPLEMENTED |
| Durable retries and crash recovery | Retry planning only | Durable scheduler/worker integration NOT IMPLEMENTED |

## Important boundary

Object.freeze and pure TypeScript checks protect the in-process domain projection. They do not provide durable immutability against database writers, distributed locking, transaction isolation, or authorization. Production persistence must independently enforce:
1. Unique attempt identity and canonical idempotency key.
2. Request fingerprint equality on duplicate submissions.
3. Atomic lease-generation compare-and-set.
4. Conditional heartbeat/completion updates against the current unexpired lease.
5. Atomic cancellation-versus-completion arbitration.
6. Append-only attempt history and owner-scoped access control.

No production migration or database mutation is part of this phase.

## Acceptance status

- [x] Domain output snapshot implementation\n- [x] Runtime-frozen attempt records
- [x] Canonical retry key derivation and initial-attempt enforcement\n- [x] Runtime validation of outcome and failure-kind enums\n- [x] Non-shortening heartbeat lease renewal
- [x] Lifecycle timestamp monotonicity
- [x] Adversarial unit regression cases authored
- [ ] GitHub Actions verification for the new commit head
- [ ] Disposable database concurrency integration tests
- [ ] Trusted worker persistence wiring
- [ ] End-to-end owner A/B isolation and crash-recovery tests
