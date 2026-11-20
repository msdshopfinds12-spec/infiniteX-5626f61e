# Phase 60 — Transactional Retry Orchestration Reference

**Status:** Draft implementation contract; isolated TypeScript orchestration and synthetic adapter tests only.  
**Base:** PR #90 head \`b7397f0d3bb6a4cbe803aaccc73ddcd327ae8858\`.  
**Database:** No live database access, SQL migration, DDL, or DML is included.

## 1. Scope

This phase adds a persistence-adapter contract and pure orchestration service over the canonical attempt domain. It does not implement a PostgreSQL adapter and must not be represented as durable production persistence.

The implementation is server-side only. It must not be imported into browser bundles, frontend components, or client-side state stores.

## 2. Transaction sequence

For a running attempt, one adapter transaction must:
1. Lock the attempt under the verified owner scope.
2. Validate the current lease and fencing generation using the existing domain function.
3. Transition that attempt to terminal \`failed\`.
4. If retryable and within budget, insert exactly one new queued attempt.
5. Update the mutable latest-state projection to the new attempt.
6. Insert a uniquely identified outbox event.
7. Commit all operations together or roll all of them back.

For exhausted or non-retryable failures, persist the terminal failed attempt and update the projection to failed, without creating a next attempt or outbox event.

A replay after a committed retry looks up the next attempt by its database-enforced scoped idempotency key and returns it rather than creating another execution.

## 3. Adapter obligations

A real PostgreSQL adapter must provide:
- One database transaction for the complete sequence.
- Row locking or equivalent concurrency control for the source attempt.
- Conditional update requiring \`status = 'running'\` and the exact expected lease generation.
- A unique constraint on the owner-scoped attempt idempotency identity.
- A unique outbox event identity.
- Owner/run/step relationship validation inside the transaction.
- Projection update in the same transaction.
- Rollback on any failed insert/update.
- Least-privilege grants; browser roles cannot invoke worker-only operations.
- Bounded query timeouts and normalized error mapping.
- Independent review against a freshly captured, human-reviewed Schema Contract V2.

The adapter must not trust caller-supplied owner IDs as authentication. It must derive/verify identity from trusted server-side auth context before entering this service.

## 4. Idempotency and external effects

The outbox event is a scheduling signal only. It does not authorize immediate provider execution. Provider actions remain disabled until provider-specific idempotency or reconciliation is implemented. A dispatcher must claim outbox records with its own lease/fencing protocol and tolerate at-least-once delivery.

The deterministic event ID is \`workflow-step-attempt-due:v1:<attempt-id>\`. Database uniqueness is mandatory; an in-memory set is not sufficient.

## 5. Synthetic test coverage

The Node test file uses an in-memory transactional fake to verify orchestration and rollback behavior. It is not evidence of PostgreSQL locking, isolation, durable commits, concurrent worker exclusion, RLS, grants, or production schema compatibility.

Coverage includes retry limit zero, transient retry, permanent/cancelled failures, stale fencing generation, rollback on outbox failure, duplicate-delivery replay, owner mismatch and stable outbox identity.

## 6. Explicit non-claims and release gates

This change does not add or modify a database schema, implement a real persistence adapter, enable enqueue/worker execution, call external providers, change Supabase/Vercel/secrets/deployment configuration, or prove cross-process concurrency safety.

Before production integration: fresh V2 catalog capture, independent SQL review, PostgreSQL adapter implementation, disposable PostgreSQL concurrency tests, RLS/privilege review, exact-head CI and human release approval.
