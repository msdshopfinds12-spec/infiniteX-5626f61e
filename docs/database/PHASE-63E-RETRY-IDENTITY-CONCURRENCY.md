# Phase 63E — Retry Attempt Identity and Concurrency

## Scope and safety

This phase adds a **disposable PostgreSQL 17 test contract only**. The schema is named
`phase63e`, contains synthetic rows, and is not a recovered production migration.
Do not apply it to Supabase, staging, or production. The workflow uses an isolated
GitHub Actions PostgreSQL service and read-only repository permissions.

No application worker, production schema, Supabase project, deployment, secret,
billing configuration, or live data is changed by this workstream.

## Invariants under test

The fixture rejects UPDATE mutations to the following identity tuple:

- `owner_id`
- `run_id`
- `step_id`
- `attempt_number`
- `idempotency_key`
- `request_fingerprint`

It deliberately permits worker-owned operational changes, including queued-to-running
claim, `lease_generation`, `heartbeat_at`, and lease timestamps. The fixture tests
the claim and heartbeat path after the identity trigger is installed.

The retry function locks the original attempt before evaluating replay. A failed replay
looks up the globally unique next-attempt idempotency key and locks the matching row
with `FOR UPDATE` before comparing owner, run, step, attempt number, key, and
request fingerprint. A cross-owner collision must raise
`retry_idempotency_conflict`.

## Test coverage

1. **Identity mutation regression:** six independent UPDATE attempts must fail with
   SQLSTATE `23514` and message `attempt_identity_immutable`.
2. **Worker compatibility:** a queued attempt can be claimed and have its heartbeat
   and lease extended without changing its identity.
3. **Replay contract:** a valid failed replay returns the already-scheduled next attempt.
4. **Cross-owner collision:** the global key collision is rejected without mutating
   either row or creating a third attempt.
5. **Atomic rollback:** an injected retry transaction failure leaves the original
   attempt running and does not leave a partially inserted next attempt.
6. **Concurrent replay:** two independent PostgreSQL sessions are both observed waiting
   on the original-attempt row lock; after release, both resolve to the same next attempt.
7. **Conditional claim race:** two independent workers race to claim one queued attempt;
   exactly one succeeds, one loses, and the lease generation increments exactly once.
8. **Two-session identity attack:** an independent UPDATE is observed waiting on the
   next-attempt row lock; after release, the immutability trigger rejects the mutation
   and the stored idempotency key remains unchanged.

The shell harness checks PostgreSQL `pg_stat_activity.wait_event_type = 'Lock'`
for named sessions, rather than relying on a sleep-only assumption. Both psql sessions
use statement timeouts to bound waits.

## Important limits

- The trigger protects UPDATE operations. Production must also restrict DELETE,
  TRUNCATE, and direct table privileges to trusted server-side roles; an UPDATE trigger
  alone cannot prevent delete-and-reinsert by a role allowed to perform those actions.
- A row lock serializes transactions only while held. The immutability invariant is
  supplied by the trigger, not by the lock.
- This synthetic contract is not proof that a supported production API currently
  mutates attempt identity. Phase 71 workers inspected to date update
  `workflow_step_runs` and `workflow_runs`, not this Phase 62 attempts table.
- The fixture intentionally does not claim production migration compatibility,
  hosted RLS behavior, Edge Function parity, or live worker behavior.
- CI must pass on the exact PR head before this phase is considered verified.

## Acceptance gate

Phase 63E is accepted only when all three workflow steps pass on the exact head:
fixture creation, identity/worker regression, and independent-session concurrency.
Keep the PR Draft and unmerged pending independent SQL review and provenance work
(Phase 73C). No production migration or release is authorized by this test result.

## Next sequence

1. Review exact-head CI and SQL diffs.
2. Independently verify the production source of truth for the attempt table and
   determine whether a matching production invariant is appropriate.
3. Confirm production role grants, RLS policies, delete/truncate paths, and trigger
   ordering before designing any production migration.
4. Re-run worker compatibility and database tests against an approved disposable
   environment.
5. Obtain separate explicit approval before any hosted database write or deployment.
