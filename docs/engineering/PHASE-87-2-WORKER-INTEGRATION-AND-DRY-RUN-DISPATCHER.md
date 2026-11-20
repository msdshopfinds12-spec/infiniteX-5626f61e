# Phase 87.2 — Worker Integration and Safe Outbox Dispatcher

**Status:** design baseline on an isolated follow-up branch  
**Base candidate:** Phase 87.1 commit `728c158df4b2c3381e3a4db1db85b018e991b0a7`  
**Production approval:** NOT GRANTED  
**External provider calls:** DISABLED  
**Database migration:** NONE in this phase

## 1. Verified implementation gap

Phase 87.1 adds transactional outbox RPCs, but the authenticated and cron workflow workers still complete successful steps with direct `workflow_step_runs` updates. Until both workers call `simula_complete_step_with_outbox`, the outbox transaction is not the worker's completion path.

Do not describe the system as end-to-end outbox integrated before this is changed and tested.

## 2. Required worker integration

Implement one shared, typed completion helper used by both authenticated and cron workers.

Inputs:
- trusted owner ID from the already validated claimed run
- claimed run ID and attempt generation
- current workflow step ID
- bounded JSON step output
- optional event descriptor only from a server-side allowlist

Required behavior:
1. Call `simula_complete_step_with_outbox` with owner, run, step, attempt and output.
2. For ordinary steps, pass null event type and null idempotency key; do not invent delivery events.
3. For explicitly allowlisted event-producing steps, derive a stable idempotency key from immutable workflow/run/step/attempt identity and pass a bounded payload.
4. Treat RPC error as step-completion failure; never fall back to a non-atomic direct success update.
5. Treat an empty RPC result as superseded/failed closed.
6. Keep existing failure persistence, attempt-generation checks, and sanitized logs.
7. Keep network/provider execution outside database transactions.

## 3. Safe dispatcher boundary

The first dispatcher is dry-run only. It may claim events and record a synthetic result, but it must not call arbitrary URLs, execute code from payloads, load user-supplied headers, or access real provider credentials.

Use a closed registry:
- event type -> fixed adapter implementation
- unknown event type -> terminally rejected or dead-lettered through an explicit policy
- adapter receives a typed, size-limited payload and stable idempotency key
- adapter has no general-purpose network client in the dry-run phase

The dispatcher must:
- claim a bounded batch (1–25)
- process each lease without holding database transactions open
- enforce a per-event execution budget shorter than the 60-second lease, or renew leases before work can exceed it
- finish using the exact lease token
- sanitize error codes before persistence
- never log payload secrets or credentials
- stop safely on shutdown and allow lease expiry/reclaim

## 4. Required tests before a dispatcher is considered usable

### Worker integration
- authenticated worker calls the completion RPC for each successful step
- cron worker calls the same RPC
- RPC failure never triggers direct-update fallback
- stale run/step generation is rejected
- a replay returns the original event for an identical idempotency key
- event creation and step completion roll back together on transaction failure

### Dispatcher
- unknown event type is not executed
- dry-run adapter makes zero outbound network calls
- concurrent dispatchers cannot process one lease simultaneously
- stale lease token cannot finish a newer attempt
- retry backoff is bounded and max attempts reaches dead-letter state
- oversized or malformed payload is rejected
- logs contain only sanitized metadata

## 5. Delivery semantics and alternatives

The system remains **at-least-once**. Provider-side exactly-once behavior cannot be guaranteed by PostgreSQL alone.

Preferred future integration order:
1. Provider supports idempotency keys: propagate the stable key.
2. Provider lacks idempotency but supports lookup: reconcile before retry.
3. Provider supports neither: require a manual-review policy for ambiguous outcomes; do not blindly retry potentially duplicate side effects.

Never claim exactly-once delivery.

## 6. Release gates

- PLAN: review contracts and migration compatibility.
- BUILD: implement shared worker helper and dry-run adapter registry.
- TEST: run exact-head Node, Deno, disposable PostgreSQL/PostgREST integration.
- AUDIT: review authorization, tenant isolation, payload limits, retry behavior, logging and dependency permissions.
- RELEASE: human approval required. No merge, production migration, provider credentials, external calls or deployment is authorized by this design.

## 7. Current evidence boundary

Phase 87.1 PR #122 remains draft and unmerged. Its Phase 81 disposable integration run must complete successfully before its integration claims are upgraded. This document is a follow-up design baseline, not evidence that dispatcher code or production delivery exists.
