# Phase 103.4 — Authenticated Worker Lease Migration Plan

Status: PLAN ONLY. This branch is stacked on the Phase 103.3 supervisor work. Do not treat this document as an implementation or a production-readiness claim.

## Objective

Move `simula-workflow-worker` from legacy run claiming and direct lifecycle table mutations to the database-enforced lease contract. Every lifecycle transition must carry the complete lease identity:

- `runId`
- `ownerId`
- `attempt`
- opaque `leaseToken`

The database is authoritative for lease validity, attempt generation, expiry, and terminal transitions.

## Verified baseline from the current worker source

The authenticated worker currently:

1. Authenticates a bearer request and obtains `ownerId`, Supabase URL, and service-role key.
2. Claims through user-scoped `simula_claim_workflow_runs`.
3. Reads and directly mutates `workflow_step_runs` in multiple paths.
4. Completes a step through the legacy `simula_complete_step_with_outbox` helper.
5. Directly updates `workflow_runs` to `succeeded` or `failed`.

The worker therefore still has lifecycle bypasses and is not lease-migrated.

## Target flow

1. Authenticate the request before creating or using the service-role client.
2. Validate the requested batch limit using the existing bounded helper.
3. Use the service-role client only to call the owner-scoped claim RPC:
   `simula_claim_workflow_runs_lease_internal` with `p_owner_id = authenticated ownerId`.
4. Validate every returned lease row using `validateLease`; reject malformed or cross-owner rows before processing.
5. Start a per-run `WorkflowLeaseSupervisor` before step execution. The supervisor renews the exact lease generation and aborts local work on lost/ambiguous ownership.
6. For each workflow step, create/resolve the attempt through `simula_start_workflow_step_with_lease`. Do not insert or update `workflow_step_runs` directly.
7. On successful action completion, use `simula_complete_step_with_outbox_lease`; validate the response and preserve transactional outbox identity.
8. On a step failure, use `simula_fail_workflow_step_with_lease` only while the supervisor still considers the lease active. If ownership is lost or transport outcome is ambiguous, stop lifecycle writes; never fall back to legacy RPCs or table updates.
9. Finish the run with `simula_finish_workflow_run_lease` using the same run, owner, attempt, and token.
10. Stop local supervision in a `finally` block. Local supervisor shutdown is not a database lease release.
11. Keep logs best-effort and non-authoritative; a logging failure must not cause a second terminal transition.

## Authentication and privilege boundary

- The public claim RPC is service-role-only after Phase 103.1. Authenticated owner identity must come from the verified bearer token, never from request JSON.
- Never expose the service-role key to the caller or return it in response data.
- Do not change RLS, grants, policies, hosted database state, or secrets in this phase.
- The service-role client must be created only after authentication succeeds.
- Claim results must be checked against the authenticated owner even though the database function is owner-scoped (defense in depth).

## Cancellation and ambiguous outcomes

- A heartbeat rejection, timeout, mismatched lease identity, or database lease rejection is fail-closed.
- No automatic retry of an ambiguous lifecycle mutation. The database may have committed even if the HTTP response was lost.
- Reconcile by reading authoritative state through a separately designed, owner-scoped read path; do not repeat a completion/finish mutation blindly.
- The existing action executor is currently synchronous and deterministic. Do not claim arbitrary external side effects are cancellable. External side-effect actions remain out of scope until Phase 104's durable-intent/idempotency design.
- A lease-lost worker must not update step or run status, including failure status.

## Migration constraints

- Remove all direct `.from("workflow_step_runs").insert/update` lifecycle writes from the authenticated worker.
- Remove all direct `.from("workflow_runs").update` terminal writes from the authenticated worker.
- Remove the legacy `simula_claim_workflow_runs` call from the authenticated worker.
- Remove the legacy `completeWorkflowStepWithOutbox` call from this worker.
- Do not retire shared legacy database RPCs globally in Phase 103.4; cron and other call sites must be migrated and permission usage verified first.
- Preserve current response shape and CORS/auth behavior unless a test demonstrates a required safe change.
- Keep per-run processing isolated: one run's failure must not prevent later claimed runs from being handled safely.

## Required test matrix

### Unit and handler tests
- Authentication failure never constructs or invokes the service-role lease claim.
- Claim RPC receives the authenticated owner ID, not a body-supplied owner.
- Malformed, cross-owner, missing-token, invalid-attempt, and expired lease rows fail closed.
- Heartbeat renewals are single-flight and preserve the same lease generation.
- Heartbeat timeout/loss aborts the run and prevents all subsequent step/run writes.
- Start, fail, complete, and finish calls always include the exact lease identity.
- A stale attempt cannot mutate a newer attempt.
- Ambiguous start/complete/finish transport outcomes are not blindly retried.
- Supervisor is shut down in all success/error paths.
- Logging failure does not trigger a second lifecycle mutation.
- Existing authentication, CORS, payload-size, timeout, retry, and owner-isolation tests remain green.

### Disposable PostgreSQL/PostgREST integration
- Real authenticated HTTP request claims only rows belonging to authenticated owner.
- Wrong owner, wrong token, wrong attempt, expired lease, and superseded attempt are rejected.
- Heartbeat expiry while waiting on a row lock is rejected using database clock after lock acquisition.
- Concurrent claimers cannot own the same live attempt.
- Step start/complete/fail and run finish are fenced end-to-end.
- Verify service-role-only claim and lifecycle grants.
- Verify the old authenticated claim RPC is no longer called by the worker.

### Static exit checks
- No legacy claim RPC reference in this worker.
- No direct `workflow_step_runs` insert/update in this worker.
- No direct `workflow_runs` terminal update in this worker.
- No legacy completion helper import or call in this worker.
- All worker tests and Deno checks pass on the exact candidate SHA.

## Safe rollback strategy

Rollback is code-only and branch-local before merge: revert the worker migration commit. Do not restore a legacy fallback branch inside the worker. The lease SQL patch remains isolated to disposable rehearsals until separately approved and reviewed. Never apply rollback SQL to hosted Supabase without explicit approval and a reviewed recovery plan.

## Exit criteria

Phase 103.4 is complete only when the authenticated worker has no lifecycle bypasses, all required tests pass against the exact PR head, the disposable PostgREST journey passes, security grants are verified, and the PR receives human review. Merge, hosted SQL, deployment, and release are separate approval gates.
