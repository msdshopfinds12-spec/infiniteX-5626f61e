# Phase 88.3 — Transactional Outbox Reliability Plan

Status: PLAN / SOURCE AUDIT IN PROGRESS
Branch: feat/phase-88-3-transactional-outbox-reliability
Base: phase-88-frontend-backend-reconciliation
Scope: repository-only changes and disposable PostgreSQL verification. No production migration, provider delivery, cron activation, secret change, merge, or deployment is authorized by this plan.

## Evidence reviewed

- The Phase 87.1 candidate migration defines private.simula_workflow_outbox, public.simula_complete_step_with_outbox, public.simula_claim_workflow_outbox, and public.simula_finish_workflow_outbox.
- The Phase 87.4 candidate migration corrects ambiguous lease_until references in the claim function.
- The migration provenance classification marks both outbox migrations PROPOSED_NOT_APPLIED and NOT_VERIFIED_LIVE. Disposable PostgreSQL rehearsal is not evidence of live application.
- The current authenticated worker calls completeWorkflowStepWithOutbox without outboxEvent. Therefore the present worker path does not emit completion events.
- The Phase 88.2 completion helper validates non-empty runId/stepId strings, but only the optional event contract enforces canonical UUIDs. This leaves the event-free call path less strict than the PostgreSQL UUID schema.
- The transactional RPC locks the workflow run and step row, validates owner/workflow/step relationships, completes the step and inserts the outbox intent in one transaction when an event is supplied.
- The outbox has a unique (owner_id, idempotency_key) constraint. The current RPC performs a SELECT-before-INSERT; concurrent same-key requests must be tested for deterministic replay behavior under the unique constraint.
- The claim RPC uses FOR UPDATE SKIP LOCKED, per-claim lock tokens, 60-second leases, and a maximum of eight attempts. The finish RPC fences updates by lock token and applies bounded retry delay / dead-letter transition.

## Phase 88.3 goals

1. Make runtime UUID validation consistent with PostgreSQL before any RPC call.
2. Prove step completion and outbox insertion are atomic.
3. Prove duplicate completion is idempotent, including concurrent duplicate requests.
4. Prove owner/workflow/step relationships cannot be crossed.
5. Prove claims are exclusive under concurrency and stale lock tokens cannot finish newer leases.
6. Prove retries are bounded and exhausted events become dead.
7. Keep all delivery adapters disabled until a separate operational phase and explicit approval.

## Required test matrix

### Completion and identity
- Reject malformed owner/run/step UUIDs before RPC invocation.
- Reject non-positive and PostgreSQL-integer-overflow attempts.
- Reject malformed event envelope, event type, idempotency key, payload keys, and identity mismatch.
- Verify valid event key determinism.
- Verify event-free completion remains supported if the feature contract requires it.

### Transaction atomicity and idempotency
- Valid completion with event creates exactly one succeeded step row and one pending outbox row.
- Failure during outbox insertion rolls back step completion.
- Failure during step completion creates no outbox row.
- Sequential duplicate completion returns the original outbox identity and replay marker.
- Concurrent duplicate completion with identical key and payload returns a deterministic result and never creates two rows.
- Same key with different owner/run/step/attempt/event/payload is rejected.
- Different owners cannot collide or inspect one another's rows.

### Claim, lease, and finish lifecycle
- Two concurrent claimers receive disjoint event IDs.
- Expired processing leases can be reclaimed with a new lock token.
- An old lock token cannot finish a reclaimed event.
- Success clears lease fields and records completed_at.
- Failure returns to pending with bounded exponential delay.
- Eighth failed attempt transitions to dead.
- Dead events are not claimable.
- Invalid batch sizes are clamped to the documented limit.

### Security and isolation
- anon and authenticated cannot access private outbox rows or execute privileged RPCs.
- service_role-only function grants are verified in the disposable database.
- SECURITY DEFINER functions retain an empty search_path and schema-qualified object references.
- Owner, workflow, run, and step foreign-key / ownership invariants are exercised with synthetic tenants.
- No test uses hosted production credentials, provider URLs, real user data, or external delivery.

## Implementation sequence

1. Add UUID boundary tests and harden the completion helper.
2. Add a disposable PostgreSQL integration harness for completion atomicity and sequential replay.
3. Add a concurrent same-key race test; change the SQL candidate only if the test demonstrates a defect. Prefer an atomic INSERT ... ON CONFLICT strategy with explicit identity/payload equivalence checks over broad exception swallowing.
4. Add claim/lease/finish lifecycle tests, including stale-token fencing and max-attempt dead-letter behavior.
5. Rehearse the exact candidate migration chain in isolated PostgreSQL 17.
6. Run Node regression, TypeScript checks, Deno worker tests, and all relevant GitHub Actions on the exact branch head.
7. Perform independent SQL privilege, tenant-isolation, and failure-path review.
8. Open a separate draft PR only after the branch has reproducible verification evidence.

## Non-goals / hard safety gates

- Do not apply migrations to Ashaa-INX or any hosted database.
- Do not schedule cron or enable an outbox dispatcher.
- Do not add provider adapters, arbitrary webhooks, callback URLs, scripts, or user-controlled routing.
- Do not expose private outbox rows through client-facing RLS/API surfaces.
- Do not merge PR #129 or this phase automatically.
- Do not claim complete delivery until the full worker -> transaction -> outbox -> claim -> finish lifecycle is tested.

## Acceptance criteria

- Exact-head CI green with logs available.
- All lifecycle and adversarial tests pass on disposable PostgreSQL.
- No unexplained SQL grants, cross-tenant access, duplicate event rows, or stale-token writes.
- Migration provenance remains explicitly NOT_VERIFIED_LIVE until separately verified through an approved read-only production check.
- Human review and separate release approval remain mandatory.
