# Phase 101.6 — Isolated Concurrency and Idempotency Hardening

Status: implementation candidate extended with an expired-lease regression scenario; runtime execution and CI evidence pending.

## Scope

Add integration coverage to the Phase 101.4 disposable PostgreSQL/PostgREST safety boundary. This phase does not change production migrations, runtime worker behavior, secrets, deployment configuration, or release state.

## Authoritative database contract inspected

The candidate migration `20261121000200_simula_transactional_workflow_outbox.sql` defines:

- Private outbox table `private.simula_workflow_outbox`.
- Unique identity `UNIQUE (owner_id, idempotency_key)`.
- Existing-event conflict when run, step, attempt, event type, or payload differs.
- A run-row `FOR UPDATE` lock before completion/replay.
- Atomic step-run update and outbox insert within one PostgreSQL function transaction.
- Service-role-only execution for completion, claim, and finish RPCs.

The application event contract separately allowlists `workflow.step.completed`, with deterministic key `workflow.step.completed:<run UUID>:<step UUID>:<attempt>` and a three-field payload containing run ID, step ID and attempt.

## Selected strategy

Use the existing Phase 81 CI service topology and a separate Deno integration test. Preserve the Phase 101.4 protections:

- Explicit `PHASE87_ALLOW_DISPOSABLE_DB_WRITES=true` opt-in.
- Approved disposable database name only.
- HTTP PostgREST restricted to loopback on port 3000.
- Canonical UUID owner validation.
- Per-invocation UUID run identities and unique idempotency keys.
- Synthetic-only payloads.
- `try/finally` cleanup scoped to exact run IDs created by this test.
- No hosted/shared database or production credentials.

## Added invariants

1. Two concurrent completion RPCs for one run and canonical event identity return one durable outbox ID; exactly one response is the original create and one is a replay.
2. Reusing the same idempotency key with a different event type is rejected by the SQL idempotency comparison.
3. Reusing the same idempotency key with a different payload is rejected by the SQL idempotency comparison.
4. Two independent runs racing for one owner-scoped idempotency key produce exactly one winner under the unique constraint.
5. The losing cross-run transaction leaves its step run in the original `running` state, demonstrating transaction rollback.
6. Cleanup uses `Promise.allSettled` so a rejected network request cannot prevent the other scoped cleanup operation from being attempted; returned errors and rejected promises both fail the test.\n7. A matching outbox lock token must not complete an event after its database-issued lease expires. The test waits for the 60-second lease, expects stale completion to fail, reclaims the event, verifies a new token, and completes with the current lease.

The event-type, payload and cross-run conflict cases deliberately call the SQL RPC directly as adversarial database-contract tests. They are not valid application-generated event descriptors; the application TypeScript contract rejects noncanonical event types, keys and payload identities before the RPC boundary.

## Why this strategy

- Additive test file avoids modifying the already verified Phase 87.1 integration path.
- Unique IDs eliminate collisions between CI executions and parallel test invocations.
- Real PostgreSQL integration validates transaction and uniqueness behavior that mocks cannot prove.
- No application/runtime changes are made until database behavior and error provenance are understood.

## Verification gates

- [ ] Deno type-check succeeds.
- [ ] New Phase 101.6 integration test passes against disposable PostgreSQL 17, including the 60-second expiry/reclaim case.\n- [ ] Apply the review patch in `supabase/patches/phase-102-4-outbox-expiry-guard.sql` to a disposable database through a generated migration before expecting the new expiry assertion to pass.
- [ ] Existing Phase 81 HTTP integration and Phase 87.1 outbox integration pass unchanged.
- [ ] Existing Node regression suite passes.
- [ ] CI logs reviewed for stale-lease and missing-event error attribution.
- [ ] Independent review of SQL RPC, uniqueness constraint and application contract.
- [ ] Human approval before merge, production database operations, secrets changes, billing, or deployment.

## Known limitations

- The new test has been source-reviewed against the candidate migration but has not yet executed against PostgreSQL.
- A push to this isolated branch currently does not match the Phase 81 workflow's exact `push.branches` filter. The `pull_request` trigger is configured, but opening a PR may invoke Vercel checks that are currently quota-blocked. Do not create the PR or trigger a preview until that consequence is accepted.
- A CI failure is a finding to investigate, not a reason to weaken assertions or bypass isolation.


## Phase 102.4 implementation note

The test suite now includes a real lease-expiry path using the public claim and finish RPCs. It does not mutate private outbox rows directly. The test intentionally takes approximately one minute because it waits for the database-issued lease to expire; this avoids relying on privileged fixture mutation or an assumed clock.

A review-only SQL patch is stored at `supabase/patches/phase-102-4-outbox-expiry-guard.sql`. It is outside the migrations directory and therefore is not automatically applied by Supabase migration tooling. The patch checks expiry with `clock_timestamp()` after acquiring `FOR UPDATE`, preserving the service-role-only function grant boundary.

The regression test is expected to fail against the current unpatched function because the current implementation accepts a matching token after expiry. This is an intentional red test until the patch is rehearsed and incorporated into a generated migration. No hosted database was modified.
