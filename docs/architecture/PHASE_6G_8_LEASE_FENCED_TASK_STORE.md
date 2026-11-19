# Phase 6G.8 — Lease-Fenced Task Store Contract

## Goal
Prevent a worker whose lease expired from renewing or settling a task after another worker has reclaimed it. The protection is a monotonically increasing fencing token plus an atomic compare-and-set operation in the durable store.

## Implementation
- `server/integrations/task-lease-store-adapter.mjs` validates and delegates claim, renew, complete, and fail operations.
- `tests/task-lease-store-adapter.test.mjs` verifies valid claims, conflicts, malformed snapshots, stale leases, fail-closed behavior, and clock validation.
- No concrete database driver is included. The adapter deliberately cannot make a non-atomic store safe.

## Required durable-driver invariants
Each method MUST execute in one database transaction or one conditional write:
1. Claim only a queued/approved task at the supplied expected version.
2. Increment a persistent fencing counter for every successful claim/reclaim.
3. Persist owner, opaque lease ID, expiry, running state, incremented task version, and audit event together.
4. Renew only when task ID, owner, lease ID, fencing token, expected version, running state, and unexpired lease all match; increment version and extend expiry atomically.
5. Complete/fail only when the same fencing tuple matches and lease is still valid; transition state, clear lease, increment version, and append event atomically.
6. A stale worker must affect zero rows and receive `false`/ `null`; never retry with a weaker predicate.
7. Use database time for expiry checks in production. The adapter clock is a deterministic test seam, not an authority for distributed clocks.

## Security boundaries
- Owner identity must come from verified server authentication, never a browser-supplied owner field.
- Service-role credentials remain server-only.
- Lease IDs are opaque correlation values, not bearer authorization.
- Fencing tokens are monotonic integers, not secrets.
- Do not put task payloads, approval tokens, or credentials in lease audit events.

## Verification
- The module is provider-neutral and contains no network or database client.
- Tests use deterministic fake atomic-store contracts; they do NOT prove PostgreSQL transaction correctness.
- No migration, live database write, deployment, or production worker was performed.
- A PostgreSQL 17 integration suite and SQL concurrency tests remain mandatory before a durable driver can be considered production-ready.

## Alternatives
- Preferred: PostgreSQL transaction / conditional UPDATE with row lock and fencing counter.
- Acceptable: another durable store with documented atomic compare-and-set and monotonic fencing semantics.
- Development only: in-memory adapter, single process, no crash recovery or multi-worker safety.
- Rejected: consume approval then claim separately; lease expiry without fencing; client-generated owner identity; worker completion without matching lease tuple.
