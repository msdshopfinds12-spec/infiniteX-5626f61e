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

Do not mark an outbox row `succeeded` merely because a dry-run adapter inspected it. That status must continue to mean the configured delivery contract completed. A dry-run dispatcher needs a separate non-delivery outcome/observability contract before it can safely claim and finish rows. Phase 90 therefore keeps provider dispatch disabled rather than corrupting delivery semantics.

## Required verification

- Unit tests for event allowlisting, payload validation, deterministic idempotency, and RPC arguments.
- Authenticated and cron worker contract tests prove both adapters resolve event metadata and use the shared atomic completion helper.
- Existing no-fallback, ownership, attempt-fencing, worker parity, and database integration suites remain required.
- All results must be attached to the exact candidate HEAD SHA before declaring the phase verified.

## Explicit non-goals

No production migration, live database mutation, provider call, secret change, billing change, deployment, merge, or release is authorized.
