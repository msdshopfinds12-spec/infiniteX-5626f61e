# Phase 90 — Transactional Outbox Worker Integration

**Branch:** `phase-90-transactional-outbox-integration`  
**Base:** Phase 89 exact head `4ca55f6e5f0cfca58bf8f797e16e91c3f8c4fccc`  
**Production migration/deployment:** NOT AUTHORIZED  
**External provider delivery:** DISABLED

## Objective

Connect a deliberately closed event-producing workflow action to the existing transactional completion RPC. The authenticated and cron workers must persist step completion and the event intent in the same PostgreSQL transaction.

## Supported event-producing action

Only `emit_notification_intent` is event-producing in this phase. It maps to the fixed event type `notification.requested`.

Required config:
- `recipient_ref`: UUID-shaped opaque recipient reference; the completion boundary additionally requires it to equal the authenticated workflow owner until a separately reviewed recipient-authorization model exists.
- `template_key`: 1–64 characters matching `[a-z0-9._-]`, beginning with an alphanumeric character.

The event payload contains exactly those two fields. Arbitrary event names, URLs, HTTP headers, credentials, executable instructions, and provider payloads are rejected. All other existing actions remain non-event-producing and pass null event metadata.

## Atomic completion contract

Both worker adapters:
1. Execute the action using the existing bounded action runtime.
2. Resolve event metadata only through the closed server-side action registry.
3. Call `completeWorkflowStepWithOutbox`.
4. The helper validates the event contract and derives a stable idempotency key from owner, run, step, attempt generation, and fixed event type.
5. The fixed RPC commits the step success and outbox row atomically.
6. RPC failure remains fail-closed; there is no direct-success fallback.

## Delivery semantics

The outbox remains at-least-once. The event represents a notification intent, not proof of notification delivery. No external provider adapter or network call is enabled in this phase.

## Dispatcher safety decision

Phase 90 adds a pure, isolated dry-run dispatcher core in `workflow-outbox-dispatcher.ts`. It validates the lease envelope, fixed event type, owner-bound recipient, exact payload schema, bounded attempts, and unexpired lease, then returns a `validated_not_delivered` plan. It has no database client, network client, secret resolver, or provider adapter.

Do not mark an outbox row `succeeded` merely because a dry-run adapter inspected it. That status must continue to mean the configured delivery contract completed. The current dry-run core deliberately does not claim or finish database rows. A separately reviewed non-delivery state and audit contract is required before an operational dispatcher can claim and release leases. Provider dispatch remains disabled.

## Required verification

- Unit tests for event allowlisting, payload validation, deterministic idempotency, and RPC arguments.
- Authenticated and cron worker contract tests prove both adapters resolve event metadata and use the shared atomic completion helper.
- Existing no-fallback, ownership, attempt-fencing, worker parity, and database integration suites remain required.
- All results must be attached to the exact candidate HEAD SHA before declaring the phase verified.

## Explicit non-goals

No production migration, live database mutation, provider call, secret change, billing change, deployment, merge, or release is authorized.


## Phase 91 — Non-delivery simulation lifecycle

Phase 91 adds a distinct `simulated` outbox state. This closes the previous operational gap where a dry-run could validate an event but had no safe terminal state to record without falsely claiming provider delivery.

### State and RPC contract

- Candidate migration: `20261121000400_simula_outbox_simulation_state.sql`.
- Adds `simulated_at` and bounded `simulation_result` metadata.
- Adds `simula_record_workflow_outbox_simulation(p_id, p_lock_token, p_result)`.
- Requires a current, unexpired lease token; stale or expired leases fail closed.
- Clears the lease atomically and transitions only `processing → simulated`.
- Identical replay is idempotent; a different replay result is rejected.
- Existing `succeeded` remains reserved for confirmed delivery.
- Simulated rows are excluded from future claims because the claim RPC only selects `pending` and expired `processing` rows.

### Dispatcher execution

The cron-authenticated Edge Function `simula-workflow-outbox-dispatcher`:
1. Authenticates through the existing verified worker-secret boundary.
2. Claims at most 25 rows using the existing lease RPC.
3. Validates only the fixed `notification.requested` event and exact owner-bound payload.
4. Records the dry-run result using the new lease-fenced simulation RPC.
5. Sends malformed event data through the existing bounded retry/dead-letter path.
6. Defers transient database errors without relabeling them as invalid payloads.

The dispatcher has no provider client, no `fetch` call, no destination URL, and no secret resolver. Its response always includes `mode: dry_run` and `deliveryAttempted: false`. It cannot report a provider delivery.

### Required verification

- Deno unit tests for auth-before-claim, exact RPC sequence, malformed payload handling, transient failures, HTTP method and body limits.
- Deno type-check of the Edge Function and shared dispatcher.
- Disposable PostgreSQL/PostgREST integration for simulation, replay conflict, and claim exclusion.
- Full exact-head CI after all changes.

### Safety boundary

This is an operational dry-run only. It does not send notifications, activate providers, apply migrations to connected Supabase, deploy Edge Functions, change secrets, or merge the branch. The migration remains a candidate until separately reviewed and approved.
