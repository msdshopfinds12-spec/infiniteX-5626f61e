# Phase 103.3 — Shared Workflow Lease Supervisor

Status: DESIGN BASELINE — implementation and runtime verification pending  
Parent candidate: `2984c5f1dc0ac98c567c60596f413ac267dca4ed`  
Working branch: `phase-103-3-shared-lease-supervisor`

## 1. Objective

Create one shared TypeScript lease supervisor used by the authenticated and cron workers. The supervisor must make lease ownership explicit, cancel work after lease loss, and ensure every database lifecycle transition is fenced by the current run generation and lease token.

This phase is not complete merely because a TypeScript interface exists. It is complete only when both worker call graphs use the adapter and adversarial tests prove that stale workers cannot mutate lifecycle state.

## 2. Evidence-based current-state findings

The inspected worker sources on the parent candidate still contain legacy lifecycle paths:

- Authenticated worker claims through `simula_claim_workflow_runs`.
- Cron worker claims through `simula_claim_workflow_runs_internal`.
- Both workers directly insert/update `workflow_step_runs`.
- Both workers directly update `workflow_runs` to succeeded or failed.
- The shared completion helper still calls the legacy `simula_complete_step_with_outbox` RPC.

Therefore Phase 103.3 must not be represented as a completed fencing migration. Phase 103.4 and 103.5 must remove these paths after the new lease contract is available.

## 3. Proposed module boundaries

Create a small shared module set under `supabase/functions/_shared/`:

- `workflow-lease-contract.ts`: validated lease types, error codes, and RPC argument/result schemas.
- `workflow-lease-supervisor.ts`: heartbeat lifecycle, lease-loss cancellation, and idempotent shutdown.
- `workflow-lease-rpc.ts`: narrow adapter for claim, heartbeat/renew, start-step, fail-step, complete-step, and finish-run RPCs.
- `workflow-lease-supervisor.test.ts`: deterministic unit tests using injected clock, scheduler, and RPC transport.

Keep database transport injectable. Unit tests must not require network access or hosted credentials.

## 4. Contract requirements

A lease identity must carry:

- `runId`
- `ownerId`
- `attempt` (positive safe integer within PostgreSQL integer range)
- `leaseToken` (opaque secret; never log or return to a client)
- `leaseUntil` (validated timestamp)

The adapter must reject malformed values before issuing an RPC. The database remains authoritative: client-side time checks are advisory only and must never replace database lease validation.

## 5. Supervisor lifecycle

1. Construct supervisor only from a successful database claim response.
2. Start a heartbeat loop with a bounded interval derived from the configured lease duration; never set the interval equal to the full lease duration.
3. Permit only one heartbeat request in flight per supervisor.
4. Renew using the exact run ID, owner ID, attempt, and lease token.
5. On renewal rejection, ambiguous transport failure beyond the safety budget, or explicit cancellation, abort the work signal and mark the supervisor terminal.
6. Do not resume a terminal supervisor. A new claim creates a new supervisor.
7. `release()` must be idempotent and must not pretend that an already-lost lease was released successfully.
8. Shutdown must clear scheduled work and await or safely detach any in-flight heartbeat without allowing a late response to revive the lease.

## 6. Critical concurrency and failure rules

- Fail closed: no legacy RPC fallback and no direct table-write fallback.
- Fence every step transition and run terminal transition with run ID, owner ID, attempt, and lease token.
- Never treat a local timeout as proof that a remote action did not happen.
- Heartbeat and lifecycle RPCs must use bounded timeouts and classify transport-ambiguous outcomes separately from explicit lease rejection.
- Do not automatically retry non-idempotent external actions. Phase 104 owns durable intent and reconciliation semantics.
- Avoid overlapping heartbeats and avoid unbounded retry loops.
- Do not log lease tokens, authorization headers, service-role keys, raw secrets, or full sensitive action payloads.
- Preserve database lock order: workflow run → step run → outbox.
- A stale worker must not mark a run failed after losing its lease.

## 7. Error taxonomy

Use stable machine-readable error codes, not message substring matching:

- `LEASE_REJECTED`: database definitively rejected the lease.
- `LEASE_EXPIRED`: database determined the lease expired.
- `LEASE_LOST`: renewal or transition proves this supervisor is no longer owner.
- `LEASE_TRANSPORT_AMBIGUOUS`: request outcome cannot be determined.
- `LEASE_CANCELLED`: local cancellation requested.
- `LEASE_INVALID`: malformed identity or RPC response.
- `LEASE_DATABASE_ERROR`: definitive database failure not covered above.

Preserve safe internal causes for diagnostics while returning sanitized errors at HTTP boundaries.

## 8. Test matrix — required before worker migration

### Unit tests
- malformed UUID, attempt, token, and timestamp rejected
- heartbeat interval bounds and single-flight behavior
- successful renewal updates expiry without changing identity
- lease rejection aborts work exactly once
- transport ambiguity enters terminal/safe state after configured budget
- late heartbeat response cannot revive terminal supervisor
- repeated release is safe
- cancellation during an in-flight heartbeat is deterministic
- no token appears in logs or serialized public results

### Integration tests on disposable PostgreSQL/PostgREST only
- correct lease can start, fail, and complete a step
- wrong owner, attempt, or token rejected
- expired lease rejected after lock acquisition
- lock-wait-expiry race rejected
- concurrent claim/heartbeat/transition cannot produce two valid owners
- run → step → outbox lock order preserved
- service-role-only grants verified
- stale worker cannot finish or fail a newer attempt

### Static and regression gates
- `deno check` for both worker entrypoints and shared modules
- repository search proves no unreviewed direct lifecycle mutation remains after worker migration
- existing workflow/outbox tests remain green
- CI executes exact PR head SHA

## 9. Migration sequence

1. Complete Phase 103.2 CI on its exact candidate SHA.
2. Implement and unit-test the shared contract/supervisor without changing worker behavior.
3. Migrate authenticated worker in Phase 103.4.
4. Migrate cron worker in Phase 103.5.
5. Search all repository call sites for legacy claim, completion, and direct lifecycle mutations.
6. Retire legacy bypasses only after call-site and permission verification.
7. Run adversarial disposable integration tests.
8. Request human review before merge or any hosted database change.

## 10. Explicit non-goals

This phase does not:
- apply SQL to hosted Supabase;
- deploy Edge Functions or the frontend;
- merge a pull request;
- change branch protection or repository settings;
- implement external side-effect idempotency (Phase 104);
- claim production readiness.

## 11. Exit criteria

Phase 103.3 is complete only when the shared implementation, deterministic tests, Deno type checks, documented error semantics, and exact-SHA CI evidence all pass. Worker migration and legacy bypass retirement remain separate gates.
