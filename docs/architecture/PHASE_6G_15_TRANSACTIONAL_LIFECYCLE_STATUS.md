# Phase 6G.15 — Transactional Lifecycle Harness

Status: IMPLEMENTATION CANDIDATE — NOT YET EXECUTED OR VERIFIED

## Scope
This phase adds disposable PostgreSQL lifecycle functions for approval, one-time grant consumption with worker claim, database-clock lease renewal, fenced settlement, and owner-scoped cancellation. All SQL remains under `tests/postgres/`; it is not a Supabase migration and must never be deployed.

## Files
- `lifecycle.sql`: test-only transactional functions.
- `lifecycle_contract.sql`: deterministic lifecycle assertions.
- `run.sh`: executes the lifecycle contract after the Phase 6G.14 smoke contract.

## Trust boundary — critical limitation
The functions accept `p_owner` and `p_worker` as explicit inputs for deterministic database contract testing. This harness does NOT authenticate those values. A caller who can invoke these functions with arbitrary identities could impersonate an owner or worker. They are therefore NOT production RPCs and must not be granted to browser, anonymous, or untrusted roles. Production implementation must derive identity from a verified server principal, use narrowly scoped database roles, and test tenant isolation before any backend decision.

## Invariants covered by design
- Approval transitions only from `awaiting_approval` at the expected version.
- Grant digest, task payload hash, version, expiry, and one-time consumption are checked under row locks.
- Claim, grant consumption, lease assignment, event append, and idempotency snapshot share one transaction.
- Same idempotency key and fingerprint returns the original claim snapshot; changed fingerprint raises a conflict.
- Lease expiry uses PostgreSQL `clock_timestamp()`, never caller-provided time.
- Renewal preserves lease ID and fencing token while incrementing task version.
- Settlement requires matching owner, worker, lease, fence, version, and unexpired lease.
- Cancellation and settlement serialize on the task row; only one terminal transition can win.

## Not yet proven
The source and test runner have been committed, but PostgreSQL execution and CI success are NOT yet verified. Adapter integration, trusted identity derivation, database role isolation, RLS, production driver, and production compatibility are also not claimed. Phase 6G.16 must add role/tenant tests and a real server-side driver only after the security contract is reviewed.
