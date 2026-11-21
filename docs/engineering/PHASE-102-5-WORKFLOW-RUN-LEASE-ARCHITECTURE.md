# Phase 102.5 — Workflow Run Lease Architecture

Status: DESIGN ONLY — no schema migration or hosted database change is included.

## 1. Objective

Replace the current age-based stale-run recovery rule with an explicit, renewable, database-owned lease. Preserve the existing monotonically increasing `attempt` generation as a fencing value, and require both the generation and lease token to match before a worker can mutate run or step state.

This phase is a design contract for a later isolated implementation. It is not evidence that a run lease exists today.

## 2. Verified baseline

Repository inspection on `phase-101-6-isolated-concurrency-hardening` found:

- `private.simula_claim_workflow_runs_internal(p_limit)` selects queued rows using `FOR UPDATE SKIP LOCKED`, changes them to `running`, stamps `started_at`, and increments `attempt`.
- `private.simula_claim_workflow_runs_internal` is replaced by the stale-recovery migration to recover a running row when `started_at < now() - interval '15 minutes'`; it requeues attempts below five and marks attempts at/above five failed.
- Both cron and authenticated worker paths use `attempt` as a generation fence for step writes and final run status updates.
- The outbox has its own `lock_token` and `lease_until` protection, including the isolated Phase 102.4 expiry patch.
- Workflow step execution currently has per-step timeout/retry budgets, but no run-level heartbeat or renewable run lease was found in the inspected worker paths.

The 15-minute `started_at` rule is an age heuristic, not proof that the worker has stopped. A legitimate long-running worker can overlap a replacement worker after that threshold. Generation checks reduce stale database writes, but they do not prevent duplicate external side effects.

## 3. Target invariants

1. Exactly one current run lease is authoritative for a run at any instant.
2. A worker may heartbeat, complete, or fail a run only when `run_id + owner_id + attempt + lease_token` all match and the lease is still valid at the database write boundary.
3. A reclaimed run increments `attempt`; the prior generation can never regain authority.
4. Lease timestamps are decided by the database clock, not a worker clock.
5. Claim, renewal, reclaim, and terminal transition are atomic database operations.
6. A failed or ambiguous heartbeat stops new step starts and prevents a success transition.
7. External actions remain at-least-once unless the provider supports idempotency and reconciliation. A database lease cannot guarantee exactly-once external execution.
8. All service-only RPCs use `SECURITY DEFINER`, an empty/fixed `search_path`, explicit grants, bounded arguments, and ownership checks.

## 4. Proposed data contract

Proposed columns on `public.workflow_runs` (names are design proposals; verify actual table definition and existing constraints before writing a migration):

- `lease_token uuid NULL`
- `lease_until timestamptz NULL`
- `heartbeat_at timestamptz NULL`

Keep `attempt integer` as the generation fence. Do not overload `started_at` as the lease clock.

Add a consistency constraint after backfill/rehearsal:
- `status = 'running'` requires non-null `lease_token` and `lease_until`.
- Non-running statuses require both lease fields to be null.
- `heartbeat_at` may be retained as diagnostic history or cleared on terminal transition; choose one convention and test it.

Compatibility rollout must be additive first. Do not immediately enforce a NOT NULL constraint on all running rows until existing rows have been safely reconciled.

## 5. RPC contract

### Claim

`private.simula_claim_workflow_runs_internal(p_limit integer)`

Within one transaction:
- Validate/clamp `p_limit` to the existing safe maximum.
- Identify queued rows and expired running rows with deterministic ordering and `FOR UPDATE SKIP LOCKED`.
- Reclaim only rows whose lease has expired according to `clock_timestamp()`.
- Increment `attempt` exactly once for each new claim.
- Generate a fresh random `lease_token` in the database.
- Set `lease_until = clock_timestamp() + configured_lease_interval` and `heartbeat_at = clock_timestamp()`.
- Return the token, lease expiry, and generation to the trusted worker.
- Never return tokens to authenticated browser clients.

Avoid a two-statement unlocked select/update pattern. Keep selection and state transition in a single SQL transaction/CTE or a row-locking PL/pgSQL block.

### Heartbeat

New service-only RPC proposal:
`private.simula_heartbeat_workflow_run(p_run_id uuid, p_owner_id uuid, p_attempt integer, p_lease_token uuid, p_extend_seconds integer)`

- Require all identity fields.
- Clamp extension to a documented minimum and maximum.
- Update only a row with matching id, owner, `status = 'running'`, generation, token, and `lease_until > clock_timestamp()`.
- Extend from database time, not from a worker-supplied timestamp.
- Return the new expiry only when exactly one row was updated.
- Return a stable stale/expired result (or raise a documented SQLSTATE) when no row matches.
- Do not permit a worker to resurrect an already-expired lease. It must go through claim/reclaim and receive a new generation/token.

### Terminal transition

Create a single service-only finish/fail RPC, or consistently apply the same guarded predicate to every terminal transition:
- Matching run id, owner, attempt, token.
- Current status is running.
- Lease is valid at the write boundary using `clock_timestamp()`.
- Clear token and expiry in the same update that sets succeeded/failed/cancelled.
- If the guard matches zero rows, treat the worker as superseded; never retry with a weaker predicate.

## 6. Worker integration contract

Both `simula-workflow-worker` and `simula-workflow-cron-worker` must use the same shared lease adapter.

- Start a heartbeat loop before the first step begins.
- Heartbeat interval must be materially shorter than the lease duration (initial design target: one-third of lease duration).
- Use an AbortSignal or equivalent cancellation channel for work that supports cancellation.
- Before starting each step and before committing its result, verify the lease state.
- If heartbeat fails, becomes ambiguous, or reports expiry: stop starting steps, cancel cancellable work, do not mark success, and let the database lease/recovery protocol decide the next owner.
- Always clear heartbeat resources in `finally`.
- Bound total run duration and heartbeat retries. A heartbeat retry must not extend beyond the current known lease expiry.
- Keep cron and authenticated worker behavior aligned through shared code, not duplicated lease logic.

Important limitation: JavaScript cancellation cannot forcibly stop every already-issued network request or provider operation. Provider idempotency keys and reconciliation remain mandatory for side-effecting integrations.

## 7. Lock ordering and deadlock control

Adopt and document one global order for any transaction that touches multiple workflow records:

1. workflow run row
2. workflow step-run row
3. outbox row

Do not introduce a path that locks outbox then run if another path locks run then outbox. Keep each transaction short; do not hold database locks while executing user-configured actions or making provider network calls.

## 8. Recovery policy

- Expired lease + attempts below maximum: eligible for reclaim with a fresh token and incremented generation.
- Expired lease + attempts at maximum: transition to terminal failed state and clear lease fields.
- Active, unexpired lease: never reclaim, regardless of `started_at`.
- Missing/invalid lease metadata on a running row during rollout: quarantine/reconcile explicitly; do not guess that it is safe to execute twice.
- Use database time for all expiry decisions.

The maximum attempts and lease duration must be configuration constants with bounded values, documented and covered by tests.

## 9. Required regression matrix

Run only against a disposable PostgreSQL database and synthetic fixtures:

| Case | Expected result |
|---|---|
| Two workers claim same queued run concurrently | One authoritative token/generation |
| Heartbeat with current token | Lease extends |
| Heartbeat with stale token | Rejected; no row mutation |
| Heartbeat after expiry | Rejected; cannot resurrect |
| Completion with current, unexpired token | One terminal transition |
| Completion with stale generation | Rejected; no row mutation |
| Completion after expiry | Rejected |
| Reclaim after expiry | New token and generation |
| Old worker completes after reclaim | Rejected |
| Old worker heartbeats after reclaim | Rejected |
| Worker dies without cleanup | Run becomes reclaimable after expiry |
| Maximum attempts reached | Terminal failure; lease cleared |
| Concurrent heartbeat and finish | One serialized, valid state transition |
| Two workers process external idempotent event | Provider key prevents duplicate effect or reconciliation detects ambiguity |

Tests must not assume the fixture is among the first N global queue rows. Use a dedicated disposable database or isolate the claim set; assert fixture identity and fail with an explicit isolation diagnostic.

## 10. Rollout plan

1. Inspect the complete base definition of `public.workflow_runs`, all dependent RPCs, triggers, indexes, and worker call sites.
2. Additive migration draft only; no production application.
3. Rehearse the complete migration chain plus new patch against disposable PostgreSQL.
4. Add SQL concurrency tests and worker unit tests before changing worker behavior.
5. Deploy compatibility code only after both old and new claim/finish contracts are understood.
6. Backfill/reconcile legacy running rows safely.
7. Enable heartbeat/reclaim behavior behind a server-side feature flag with bounded rollback.
8. Observe lease age, heartbeat failures, reclaim counts, stale-token rejections, and run completion latency.
9. Remove the old 15-minute heuristic only after the new lease path is proven and all workers use it.

## 11. Observability

Emit structured events without secrets or raw payloads:
- `workflow_run_claimed`
- `workflow_run_heartbeat_succeeded`
- `workflow_run_heartbeat_rejected`
- `workflow_run_lease_expired`
- `workflow_run_reclaimed`
- `workflow_run_superseded`
- `workflow_run_terminal_transition`

Useful metrics: active lease count, oldest lease age, heartbeat latency/failure ratio, expired lease count, reclaim rate, max-attempt failures, and stale-generation rejection count.

## 12. Explicit non-goals

This design does not add arbitrary URL execution, arbitrary code execution, unrestricted provider adapters, or client-side control of worker lifecycle. It does not claim exactly-once delivery. It does not apply a hosted migration, change secrets, deploy Edge Functions, merge branches, or publish the application.

## 13. Exit criteria

Phase 102.5 design is ready for implementation only when:
- actual schema and all worker call sites are fully inventoried;
- RPC inputs/outputs and SQLSTATE behavior are fixed;
- lock ordering and rollout compatibility are approved;
- regression tests cover the matrix above;
- disposable CI proves the implementation;
- security review confirms service-only grants and no browser exposure.

Current status: DESIGN DOCUMENT CREATED; implementation and runtime verification remain pending.
