# Phase 101.6 — Isolated Concurrency and Idempotency Hardening

Status: implementation candidate; runtime execution and CI evidence pending.

## Scope

Add integration coverage to the Phase 101.4 disposable PostgreSQL/PostgREST safety boundary. This phase does not change production migrations, runtime worker behavior, secrets, deployment configuration, or release state.

## Selected strategy

Use the existing Phase 81 CI service topology and a separate Deno integration test. Preserve the existing safety requirements:

- Explicit `PHASE87_ALLOW_DISPOSABLE_DB_WRITES=true` opt-in.
- Approved disposable database name only.
- HTTP PostgREST restricted to loopback on port 3000.
- Canonical UUID owner validation.
- Per-invocation UUID run identities and unique idempotency keys.
- Synthetic-only payloads.
- `try/finally` cleanup scoped to exact run IDs created by this test.
- No hosted/shared database or production credentials.

## Added invariants

1. Two concurrent completion RPCs for one run and one idempotency key return one durable outbox ID; exactly one response is the original create and one is a replay.
2. Reusing the same idempotency key with a different event type is rejected.
3. Reusing the same idempotency key with a different payload is rejected.
4. Two independent runs racing for one owner-scoped idempotency key produce exactly one winner.
5. The losing cross-run transaction leaves its step run in the original `running` state, proving rollback of the step transition.
6. Cleanup failures fail the test rather than being silently ignored.

## Why this strategy

- Additive test file avoids modifying the already verified Phase 87.1 integration path.
- Unique IDs eliminate collisions between CI executions and parallel test invocations.
- Real PostgreSQL integration validates transaction and uniqueness behavior that mocks cannot prove.
- No application/runtime changes are made until database behavior and error provenance are understood.

## Verification gates

- [ ] Deno type-check succeeds.
- [ ] New Phase 101.6 integration test passes against disposable PostgreSQL 17.
- [ ] Existing Phase 81 HTTP integration and Phase 87.1 outbox integration pass unchanged.
- [ ] Existing Node regression suite passes.
- [ ] CI logs reviewed for stale-lease and missing-event error attribution.
- [ ] Test assumptions reconciled against the authoritative SQL function and unique index.
- [ ] Human approval before merge, production database operations, secrets changes, billing, or deployment.

## Known limitation

The test encodes the owner/idempotency-key uniqueness contract proposed by the Phase 88.3 candidate test design. It must be validated against the authoritative SQL function and unique index before being treated as proof of correctness. A CI failure is a finding to investigate, not a reason to weaken assertions or bypass isolation.
