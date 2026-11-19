# Phase 6G.13 — PostgreSQL Lifecycle Driver Contract

Status: DESIGN ONLY — REVIEW REQUIRED; NO SQL OR DATABASE CHANGES
Branch: `feat/infiniteX-zero-budget-implementation`
Prerequisites: Phase 6G.12 adapter/fake contract; 6G.9A–9C canonical model and PostgreSQL review documents.

## 1. Decision

Do not implement or connect a production database driver in this phase. This document reconciles the Phase 6G.12 lifecycle adapter with the existing canonical task model and records the minimum transaction contract a future PostgreSQL 17 driver must satisfy.

Backend ownership remains unconfirmed. PostgreSQL is the preferred transactional target only if the project owner confirms an appropriate backend and cost boundary. The existing Supabase proposal remains review-only and must not be copied into a migration unchanged.

## 2. Current adapter contract

The provider-neutral adapter exposes:

- `issueApprovalGrantV1`
- `approveTaskWithGrantV1`
- `claimApprovedTaskV1`
- `renewExecutionLeaseV1`
- `settleExecutionV1`
- `cancelApprovedOrRunningTaskV1`

Lifecycle calls derive principal and worker subjects using trusted server-side resolver functions. They validate bounded lease durations, safe positive versions/fencing values, idempotency keys, terminal target states, result digests, failure-code bounds, lease tuple identity, and exactly-one task-version increments on successful transitions.

The adapter is not a database. It cannot prove durable uniqueness, transaction atomicity, row locking, cross-process serialization, or DB-clock expiry. The in-memory fake is test-only.

## 3. Preserve domain state vocabulary

Do not silently replace the existing domain lifecycle states. The durable mapping must preserve these states:

| Domain / service state | Durable representation | Lease rule |
|---|---|---|
| queued | queued | no lease |
| planning | planning | no lease |
| awaiting_approval | awaiting_approval | no lease |
| approved | approved | no lease; may be cancelled |
| running | running | complete active lease tuple required |
| succeeded | succeeded | terminal; no lease |
| failed | failed | terminal unless explicit retry is separately approved |
| cancelled | cancelled | terminal; no lease |

The Phase 6G.12 adapter's terminal settlement target is `succeeded` or `failed`. Do not rename `succeeded` to `completed` in storage without a deliberate versioned mapping and compatibility tests.

Task IDs and owner subjects are currently opaque strings at service boundaries. A future schema may use internal UUID primary keys, but it must preserve a stable mapping for opaque domain task IDs and trusted owner subjects. Never assume a principal subject is a UUID.

## 4. Required durable aggregate

The task row must contain, at minimum:

- internal primary key and unique owner-scoped domain task ID;
- trusted owner/tenant subject reference;
- current domain status;
- monotonically increasing task version;
- independent monotonically increasing event sequence;
- persistent per-task fencing token;
- canonical payload reference/hash and immutable agent/capability version bindings;
- current lease ID, authenticated worker reference and database expiry when running;
- database-generated created/updated timestamps.

Separate relations are required for single-use approval grants, append-only events, and operation idempotency. Do not store raw approval tokens, secrets, full authorization headers, or unrestricted worker output.

Constraints must enforce status/lease consistency: running means the complete lease tuple is present; non-running means there is no active lease tuple.

## 5. Transactional operation semantics

Every operation below must be one database transaction. All state predicates and expiry checks are evaluated by the database, not by a browser or application clock.

### 5.1 Claim approved task

Lock task and approval grant in one documented, consistent lock order. Verify owner, approved state, expected version, exact payload/agent/capability binding, unconsumed grant, token digest and unexpired grant using database time.

On success, atomically:
1. consume the grant once;
2. transition approved → running;
3. create a server-authenticated worker lease;
4. increment the task fencing token exactly once;
5. increment task version exactly once;
6. allocate the next independent event sequence and append the claim event;
7. persist the idempotent response snapshot.

Any error rolls back all seven effects. A repeated identical idempotency request returns the original lease snapshot; a changed request with the same key returns a typed conflict.

### 5.2 Renew lease

Require owner, running state, expected task version, lease ID, authenticated worker identity, fencing token, idempotency key and bounded extension.

The conditional update must require `lease_expires_at > clock_timestamp()` and exact match of the complete active lease tuple. On success preserve lease ID and fencing token, set expiry from database time, increment task version exactly once, append one event, and persist the original idempotent response. A stale/expired lease changes no task or event row.

### 5.3 Settle execution

Accept only `succeeded` or `failed`. Require the same full lease tuple, owner, running state, expected version and unexpired DB-time lease.

On success, atomically set the terminal status, clear the active lease tuple, increment task version, append a bounded/redacted terminal event, and persist the idempotent response. A different result digest or failure code under the same idempotency key is a conflict. A stale worker affects zero rows.

### 5.4 Cancel approved or running task

Authorize cancellation from the trusted owner, require expected task version and an idempotency key. Permit approved → cancelled and running → cancelled only.

For a running task, atomically clear the active lease and increment the persistent fencing token to revoke the prior worker epoch. This invalidates stale worker writes at every downstream resource that enforces fencing. Increment task version, append a cancellation event, and persist the idempotent result. The cancellation/settlement race is serialized by the task row lock: exactly one terminal transition wins; the loser returns a stable conflict/stale outcome and appends no event.

Cancellation does not prove an external side effect was undone. It only revokes authority for future fenced writes and records the task transition.

## 6. Idempotency and event model

Use a separate operation idempotency relation with a unique key scoped by owner, task and operation. Store a canonical request fingerprint and the minimal original response required for replay (including lease tuple and expiry where applicable).

- Same scope/key + same fingerprint: return the original result without a second mutation or event.
- Same scope/key + different fingerprint: return conflict.
- Different operations use distinct idempotency scopes.
- Idempotency records and event writes commit in the same transaction as the task mutation.

Task version and event sequence are independent counters. Event allocation must be serialized under the task lock and inserted atomically. Enforce unique (task_id, event_seq). Event tables must be append-only to application roles.

## 7. Database time, locks and fencing

- Use `clock_timestamp()` for lease and approval expiry checks inside the transaction.
- Never accept a caller-supplied `now` timestamp as an authorization input.
- Keep lock ordering consistent across claim, renew, settle, cancel and recovery operations.
- Use conditional updates or row locks plus expected-version predicates; do not implement read-then-write without an atomic predicate.
- A successful claim/reclaim increments the persistent fencing token. Cancellation of a running task also increments it to revoke the active worker epoch.
- Renewal preserves the fencing token. Settlement clears the lease but does not reset the token.
- Any downstream system that accepts worker writes must enforce the highest fencing token it has observed; database fencing alone cannot prevent a worker from writing to an uncooperative external system.

## 8. Minimum PostgreSQL 17 disposable test matrix

No production database, credentials or Supabase project is part of this design. Before a driver is accepted, build a disposable PostgreSQL 17 CI service and test with independent connections:

1. clean schema install and repeat-apply safety;
2. two workers racing to claim one approval — exactly one winner;
3. grant consumption and task claim rollback together;
4. same-key replay returns original lease; changed request conflicts;
5. concurrent renewals with same expected version — at most one mutation/event;
6. expired lease cannot renew or settle;
7. old worker cannot settle after a new fencing epoch;
8. settlement replay is stable and changed result conflicts;
9. cancellation versus settlement race — exactly one terminal winner;
10. cancellation revokes running lease and advances fencing;
11. owner/tenant mismatch returns non-enumerating outcome;
12. event sequence remains unique under concurrent mutations;
13. task, idempotency, grant and event state all roll back on injected transaction failure;
14. database roles prove browser/anonymous clients cannot access private tables or privileged RPCs;
15. audit/event output contains no raw approval tokens or secrets.

Sequential unit tests and the in-memory fake do not satisfy this matrix.

## 9. Security and operational gates

- Principal and worker identity must be derived from verified server credentials, never request-body labels.
- Browser bundles must contain no database service key, HMAC secret or worker credential.
- Apply least-privilege table and function grants; review RLS and any SECURITY DEFINER function separately.
- Bound payload, event metadata, result references, error codes and execution duration.
- Define retention, backup/restore, key rotation, rate limits, worker crash recovery and dead-letter handling.
- Keep the executor disabled until durable integration, race tests, tenant isolation and security review all pass.

## 10. Alternatives

1. **Preferred conditional option:** PostgreSQL 17 with short transactional RPCs, row locks/conditional writes, persistent fencing and append-only event writes.
2. **Alternative:** another durable store only if it proves equivalent atomic compare-and-set, DB-authoritative expiry, monotonic fencing, tenant scoping, idempotency and atomic event persistence under concurrent connections.
3. **Demo fallback:** current in-memory fake for unit/UI demonstrations only; explicitly non-durable and single-process.
4. **Rejected:** browser-direct database mutation, client-clock expiry, process-local production fencing, split grant-consumption/claim transactions, and any generic unrestricted status-update endpoint.

## 11. Approval boundary

This file is a design proposal only. It does not authorize schema creation, migration, backend selection, credential setup, production wiring, executor activation, merge, deployment, billing or public release. Those actions require a separate review and explicit approval.
