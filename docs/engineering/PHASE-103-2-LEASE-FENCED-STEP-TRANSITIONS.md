# Phase 103.2 — Lease-Fenced Step Transition Contract

Status: DESIGN / IMPLEMENTATION GATE
Branch: `phase-101-6-isolated-concurrency-hardening`
Prerequisite: Phase 103.1 owner-scoped claim patch must pass disposable PostgreSQL + PostgREST CI.
Scope: additive rehearsal SQL and worker-side adapters only. No hosted database changes.

## 1. Why run-level fencing alone is insufficient

The current worker implementations fence step generations by `attempt`, but the transactional `simula_complete_step_with_outbox` RPC validates only run owner, run status, and attempt. It does not validate `lease_token` or `lease_until`. A worker whose lease has expired but whose run has not yet been reclaimed can therefore still pass the existing attempt check.

The same gap exists in direct step-start and step-failure updates. Checking heartbeat immediately before a write is not sufficient: the lease can expire between the heartbeat and the subsequent update. The database must validate the lease inside the same transaction that performs each state transition.

## 2. Required RPC contract

Every worker-originated workflow state transition must prove the complete lease identity:
`(run_id, owner_id, attempt, lease_token)`.

Add service-role-only, public-schema PostgREST facades backed by private SECURITY DEFINER functions:

1. `simula_start_workflow_step_with_lease`
   - Inputs: run id, owner id, step id, attempt, lease token, bounded input.
   - Lock `workflow_runs` first with `FOR UPDATE`.
   - Verify status=running, owner, attempt, token, and lease_until > clock_timestamp().
   - Validate step belongs to the run's workflow and owner.
   - Create or advance the step-run row only when its attempt is lower; same-attempt duplicate start is a deterministic conflict unless explicit idempotent replay is supported.
   - Return the step-run identity and whether this was a replay.

2. `simula_complete_step_with_outbox_lease`
   - Add lease token to the current completion contract.
   - Lock and validate workflow run first, then step-run.
   - Verify unexpired lease using `clock_timestamp()` after acquiring locks.
   - Update step success and insert the optional outbox intent atomically.
   - Keep stable provider idempotency keys independent of lease token and attempt.
   - Preserve current outbox replay checks and bounded JSON validation.

3. `simula_fail_workflow_step_with_lease`
   - Inputs include complete lease identity and bounded error.
   - Lock and validate workflow run first, then update only the matching running step generation.
   - Reject expired, stale, or mismatched lease identity.

4. Existing `simula_heartbeat_workflow_run` and `simula_finish_workflow_run_lease`
   - Remain the sole heartbeat and terminal transition authority.
   - All operations must use `clock_timestamp()`, not transaction-start `now()`, for lease expiry decisions.

## 3. Lock ordering and concurrency

Canonical lock order for all new transition RPCs:
1. `public.workflow_runs` row
2. `public.workflow_step_runs` row
3. `private.simula_workflow_outbox` row/index operations

Before changing the existing outbox completion RPC, audit every function that locks these tables. If any existing function takes locks in a different order, resolve the inversion or isolate the new path; do not assume the proposed order is safe without checking the full call graph.

Use `FOR UPDATE` on the run row and evaluate `clock_timestamp()` after the lock is acquired. A lease check in application code or a separate RPC call is not an adequate substitute.

## 4. Worker adapter responsibilities

The shared TypeScript adapter must:
- Validate UUIDs, positive integer attempt, token format, and parseable future lease expiry.
- Claim through the service-only RPC. Authenticated worker must pass authenticated `owner_id`; cron may pass NULL only after cron authentication.
- Immediately start a sequential heartbeat loop; never allow overlapping heartbeat requests.
- Abort cooperative work on heartbeat failure, expiry, malformed response, or lease supersession.
- Assert lease active before and after every action and before each DB transition.
- Call only lease-fenced step start/failure/completion and terminal RPCs.
- Stop and await heartbeat in `finally`; cleanup must not mask the original failure.
- Never fall back to direct `workflow_runs` or `workflow_step_runs` terminal/status updates.

## 5. External side-effect semantics

A lease token protects database state; it cannot reverse a third-party action already accepted by a provider. For every external action:
- Prefer a durable intent/outbox transaction before delivery.
- Use a stable idempotency key derived from run id + step id + logical operation, not the changing lease token or attempt.
- Pass AbortSignal where supported, but treat cancellation as best effort.
- For providers without idempotency, record ambiguous outcomes and reconcile/compensate. Do not promise exactly-once semantics.

The current `workflow-actions.mjs` is a deterministic local action allowlist; it does not yet prove third-party delivery support. External provider execution must remain disabled until an adapter, idempotency policy, secret boundary, and reconciliation path are reviewed.

## 6. Mandatory tests

- Owner A claim cannot return Owner B's run; wrong-owner exact-run claim returns an empty set.
- Concurrent same-owner claims yield exactly one lease.
- Authenticated worker passes the verified JWT owner id and cannot submit an arbitrary owner id.
- Cron global claim is inaccessible without cron authentication.
- Expired lease rejects step start, step failure, step completion, heartbeat, and terminal finish even before a replacement worker claims.
- Reclaim rotates token and increments attempt; old worker cannot mutate run, step, or outbox.
- Duplicate step start/completion behavior is deterministic.
- Outbox insertion and step success are atomic.
- Lock contention does not allow a transaction-start timestamp to revive an expired lease.
- Heartbeat never overlaps; loss aborts work; cleanup awaits the loop.
- Existing auth, CORS, payload-size, retry, timeout, ownership, and outbox tests remain green.

## 7. Rollout gate

Do not modify the active worker paths until:
1. Phase 103.1 CI reports conclusion=success.
2. The complete SQL transition contract is implemented in a rehearsal patch.
3. Disposable PostgreSQL + PostgREST tests pass for every new RPC.
4. Both workers can be migrated in one coordinated change.
5. The migration path and legacy running-row drain are reviewed.

No hosted migration, production write, deployment, merge, or release is included in this phase.
