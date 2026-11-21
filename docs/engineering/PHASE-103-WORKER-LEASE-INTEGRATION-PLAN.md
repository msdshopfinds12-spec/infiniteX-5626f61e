# Phase 103 — Workflow Worker Lease Integration Plan

Status: PLAN ONLY — implementation not started
Target branch: `phase-101-6-isolated-concurrency-hardening`
Prerequisite: Phase 102.6 disposable PostgreSQL + PostgREST integration must pass.
Scope: authenticated workflow worker and cron workflow worker; no hosted database or production rollout.

## 1. Executive decision

Migrate both worker entry points to one shared lease lifecycle adapter in the same release unit. Do not migrate only one worker: the current authenticated worker claims through `simula_claim_workflow_runs`, while the cron worker claims through `simula_claim_workflow_runs_internal`. Both currently finish/fail runs with direct table updates that fence by owner/status/attempt but do not verify lease token or expiry.

The new protocol must carry the tuple `(run_id, owner_id, attempt, lease_token)` for the entire execution. The database is authoritative for lease validity. A worker that cannot renew or prove its lease must stop progressing and must not mark the run terminal.

## 2. Existing verified code facts

- `simula-workflow-worker/index.ts` authenticates a user request, claims through the user-scoped legacy RPC, and creates a service-role client for execution reads/writes.
- `simula-workflow-cron-worker/index.ts` authenticates the cron request and claims through the service-role legacy RPC.
- Both workers have parallel step execution logic and attempt-generation compare-and-set updates.
- Both call the shared `completeWorkflowStepWithOutbox` helper, which calls `simula_complete_step_with_outbox` and fails closed on RPC errors.
- Both finish and fail workflow runs using direct updates fenced by id, owner, running status, and attempt; neither currently passes a lease token.
- The Phase 102.6 lease SQL is a rehearsal patch, not a migration. Its RPCs must not be assumed present in hosted environments.
- Phase 102.6 CI run 44896204153 was still reported in progress at the time this plan was written; passing status is a hard prerequisite, not assumed.

## 3. Target architecture

Both entry points use the same shared modules:

1. `workflow-run-lease.ts`: strict lease identity types and runtime validation.
2. `workflow-run-lease-rpc.ts`: typed adapters for claim, heartbeat, finish, and fail RPCs; normalize database errors into safe domain errors.
3. `workflow-run-lease-supervisor.ts`: heartbeat lifecycle, cancellation signal, lease-loss signal, bounded renewal cadence, and deterministic cleanup.
4. `workflow-step-execution.ts` (only if extraction reduces duplication without widening scope): shared step orchestration and lease checks around DB transitions.

Worker-specific responsibilities remain separate:
- Authenticated worker: authenticate caller, claim only runs belonging to that caller, then use service role only after ownership validation.
- Cron worker: authenticate cron secret, claim through service role, validate every returned row before execution.

## 4. Lease lifecycle contract

- Claim returns run id, workflow id, owner id, input, attempt, lease token, and lease expiry.
- Validate UUIDs, positive attempt, non-empty token, and parseable future expiry before executing.
- Start heartbeat immediately after claim and before loading workflow steps.
- Renewal interval must be materially shorter than lease duration (initial proposal: 1/3 of lease duration); derive from configured lease duration and enforce a minimum/maximum to avoid timer storms.
- Use an AbortController or equivalent cancellation signal for cooperative action cancellation. On heartbeat error, expired lease, malformed response, or superseded generation: mark lease lost, abort in-flight cooperative work, stop starting further steps, and do not write terminal state.
- Before each step start, before/after each action, and before each database completion transition, verify the supervisor is still active. The database RPC remains the final authority.
- Finish and fail only through lease-protected RPCs with run id + owner id + attempt + token. Never use direct workflow_runs terminal updates as fallback.
- Heartbeat must be stopped and awaited in a finally block. Cleanup must not mask the primary execution error.

## 5. Step and outbox fencing

Phase 103 must not claim complete run-level safety while step completion is only fenced by attempt.

Preferred option: extend the transactional step completion RPC with lease token and expiry validation, locking the workflow run before changing the step row or inserting outbox intent. Keep step completion and outbox insertion in one transaction.

Any step failure transition must use an equivalent fenced RPC or a narrowly scoped database function; a direct service-role update guarded only by attempt is insufficient for the lease protocol.

Lock order must be documented and consistent. Proposed order: workflow_runs row first, workflow_step_runs row second, outbox row/index work third. Audit existing functions before adopting this order; avoid introducing inversion against existing callers.

## 6. External side-effect safety

Database fencing cannot undo a third-party side effect already performed by an expired worker.

Required controls:
- Use stable idempotency keys derived from run id + step id + logical operation, not lease token or attempt, so retries/reclaims do not create new external operations.
- Persist an intent/outbox record transactionally before asynchronous delivery where supported.
- For providers without idempotency support, use a reconciliation/compensation state and document at-least-once semantics; do not promise exactly-once execution.
- Pass AbortSignal to actions that support cancellation, but treat cancellation as best-effort only.

## 7. Rollout and compatibility

1. Keep Phase 102.6 patch isolated until its disposable integration test passes.
2. Produce a schema-parity rehearsal and a reviewed forward migration plan; do not apply to hosted Supabase.
3. Add RPC compatibility tests for both PostgREST and direct database invocation.
4. Deploy both worker code paths only after the database contract is available in the target environment.
5. Do not leave a mixed state where one worker uses leases and the other can reclaim via legacy stale recovery.
6. Reconcile legacy running rows without lease metadata before enabling lease-only recovery. Define a bounded drain/quarantine procedure; do not silently adopt legacy rows.
7. Remove or disable legacy claim/recovery only after both workers are proven to use lease protocol and rollback is available.

## 8. Test matrix and exit criteria

Required automated tests:
- simultaneous claims yield exactly one lease owner;
- authenticated worker cannot claim another owner's run;
- cron worker can claim only through authenticated service-role boundary;
- heartbeat renews only matching owner + attempt + token;
- expired lease cannot be resurrected;
- heartbeat loss aborts work and prevents subsequent steps;
- lease expiry/reclaim increments attempt and rotates token;
- old worker cannot finish, fail, start a step, complete a step, or enqueue outbox after reclaim;
- current worker can complete step + outbox atomically;
- concurrent duplicate completion is idempotent or safely rejected;
- cancellation produces a valid terminal state only while lease remains current;
- slow action renews lease without unbounded heartbeat concurrency;
- heartbeat shutdown leaves no pending task/resource;
- cleanup errors do not hide primary failures;
- all pre-existing worker auth, CORS, payload-size, retry, timeout, ownership, and outbox regression tests pass.

Exit criteria:
- Phase 102.6 CI run has conclusion success with captured logs.
- Both workers call the same lease adapter; no legacy claim or direct terminal update remains in their active path.
- All new tests pass against disposable PostgreSQL/PostgREST.
- Static type checks, lint, and full relevant regression suite pass.
- Security review confirms no user-accessible execution of service-only RPCs.
- A human reviews the migration and release plan before any hosted DB changes.

## 9. Alternatives considered

A. Shared adapter + both workers migrated together — preferred; minimizes protocol drift.
B. Feature-flagged dual path — acceptable only if the flag is server-side, default-off, and both paths cannot claim the same queue concurrently.
C. Migrate cron first, authenticated worker later — rejected; mixed legacy/new reclaimers can race.
D. Keep attempt-only fencing — rejected as final architecture; attempts do not prove the current worker still owns an unexpired lease.
E. Make lease expiry longer instead of heartbeat — rejected as a correctness fix; it only delays recovery and does not prevent stale completion.

## 10. Explicit non-goals and safety boundaries

- No hosted Supabase migration or SQL execution.
- No production data writes.
- No deployment, merge, branch deletion, or public release.
- No secrets or credentials added to repository.
- No claim of exactly-once third-party effects without provider-level idempotency evidence.
- No Phase 103 implementation before Phase 102.6 CI passes and this plan is reviewed against the actual migration/RPC contracts.

## 11. Evidence ledger

| Item | Status |
|---|---|
| Authenticated worker inspected | VERIFIED — source read on target branch |
| Cron worker inspected | VERIFIED — source read on target branch |
| Shared step/outbox helper inspected | VERIFIED — source read on target branch |
| Existing terminal updates omit lease token | VERIFIED — source read |
| Phase 102.6 integration run | PENDING — run 44896204153 |
| Phase 103 implementation | NOT STARTED |
| Hosted migration | NOT PERFORMED |
| Production rollout | NOT APPROVED |
