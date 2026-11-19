# Phase 6G.9D — Unified Execution Contract

Status: DESIGN BASELINE — NOT IMPLEMENTED
Branch: `feat/infiniteX-zero-budget-implementation`
Scope: unify approval, lifecycle, lease fencing, and durable-store semantics before a PostgreSQL driver is built.
Safety: documentation-only. No runtime code, SQL, migration, database connection, credentials, deployment, or production mutation.

## 1. Executive decision

InfiniteX currently has three adjacent but non-identical execution contracts:

1. Domain lifecycle: `src/lib/task-lifecycle.mjs`
2. Approval persistence seam: `server/ai/approval-task-store-adapter.mjs`
3. Lease-fenced persistence seam: `server/integrations/task-lease-store-adapter.mjs`

Do not connect these as independent sequential writes. The durable execution boundary must be one atomic, server-authorized operation that validates and consumes approval, moves the task to running, assigns a lease, increments the fencing token, increments task version, and appends the event in one transaction.

The current in-memory repository remains the development/test implementation. It is explicitly process-local and is not a distributed or durable production store.

## 2. Source-confirmed state mismatch

The domain lifecycle defines:
`queued → planning → awaiting_approval → approved → running → succeeded|failed`
with user cancellation/rejection to `cancelled`.

The approval store adapter currently claims directly:
`awaiting_approval → running`.

The lease adapter expects a running snapshot and a lease tuple.

This skips the domain's explicit `approved` state and produces two competing transition histories. A durable driver must not silently pick one.

### Selected canonical transition

Use the domain lifecycle as the state-machine authority:

1. `queued → planning` — trusted system actor.
2. `planning → awaiting_approval` — trusted system actor.
3. `awaiting_approval → approved` — authenticated human approval.
4. `approved → running` — trusted execution claim, only when a valid one-time approval grant is atomically consumed and a lease is assigned.
5. `running → succeeded|failed` — active lease holder with matching owner, lease ID, fencing token, expected version, and unexpired database-clock lease.
6. `queued|planning|awaiting_approval|approved|running → cancelled` — authorized user cancellation, subject to explicit policy and active lease invalidation.

**Compatibility note:** the existing approval adapter's `fromStatus: awaiting_approval` and `toStatus: running` is a legacy seam. Do not wire it to the new durable implementation as-is. Introduce a versioned unified operation and migrate callers only with contract tests.

## 3. Unified atomic operation API

Provider-neutral driver interface (proposed):

### `claimApprovedTaskV1(input)`

Input:
- `taskId`
- `principalSubject` (derived by verified server authentication middleware)
- `expectedTaskVersion`
- `expectedPayloadHash`
- `expectedAgentId`, `expectedAgentVersion`
- `expectedCapabilityId`, `expectedCapabilityVersion`
- `approvalTokenDigest` (never raw token)
- `workerIdentity` (derived from trusted worker authentication, not browser input)
- `leaseDurationMs`
- `idempotencyKey` (scoped to owner + operation)

Atomic transaction requirements:
1. Resolve task by opaque task ID and authenticated owner scope.
2. Lock task row using one documented global lock order.
3. Validate current status is `approved`, expected version, payload hash, agent/capability version pins, owner, and idempotency semantics.
4. Validate approval grant digest, binding tuple, unused state, and expiry using database time.
5. Consume approval grant exactly once.
6. Increment fencing token monotonically.
7. Create lease ID and set authenticated worker identity and DB-clock expiry.
8. Transition `approved → running`, increment task version.
9. Allocate independent event sequence and append a redacted event.
10. Persist idempotency result.
11. Commit and return the complete authoritative task + lease snapshot.

Any failed check returns a typed non-success result and rolls back all writes. Do not reveal whether another tenant owns the requested task.

### `renewTaskLeaseV1(input)`

Input: task ID, principal subject, worker identity, lease ID, fencing token, expected task version, bounded lease duration.

Must conditionally update only when:
- owner and worker identities match;
- status is running;
- lease ID and fencing token match;
- expected task version matches;
- `lease_expires_at > clock_timestamp()`.

On success: extend expiry from database time, increment task version, allocate independent event sequence, append a redacted renewal event, return complete snapshot. A stale or expired lease returns a conflict outcome and performs no mutation.

### `settleTaskV1(input)`

Input: task ID, principal subject, worker identity, lease ID, fencing token, expected version, target outcome (`succeeded` or `failed`), bounded result/error metadata.

Must verify the same active lease tuple and database-clock expiry predicate, transition once, increment version, append event, clear active lease fields, and commit atomically. A stale worker must never settle after a newer claim.

### `cancelTaskV1(input)`

Input: task ID, principal subject, expected version, idempotency key.

Must authorize owner, compare version, transition to cancelled, invalidate active lease by incrementing fencing token and clearing lease fields, append event, and commit atomically. Cancellation is not proof that an already-running external side effect was rolled back; executors must support cooperative cancellation and idempotent side effects.

## 4. Durable row and event invariants

The database contract must enforce:

- `task_version >= 0`
- `event_seq >= 0`, independently allocated from task version
- `fencing_token >= 0`, incremented on every new claim and cancellation invalidation
- `status = running` implies a complete lease tuple
- non-running statuses do not retain an active lease tuple
- lease expiry is a timestamptz and checked against database time
- unique (task_id, event_seq)
- unique owner-scoped idempotency key
- unique one-time approval grant digest
- approval grant binding includes task, owner, task version, payload hash, agent/capability IDs and versions
- append-only task events: application runtime role cannot UPDATE or DELETE
- bounded input, result, error, and event metadata sizes
- explicit owner/tenant isolation in every read and write
- foreign keys do not silently erase audit history

Avoid storing raw approval tokens, secrets, provider credentials, or unredacted tool output in events.

## 5. Stable result contract

The provider-neutral driver should return discriminated outcomes, not ambiguous booleans:

- `{ outcome: "claimed", task, lease }`
- `{ outcome: "renewed", task, lease }`
- `{ outcome: "settled", task }`
- `{ outcome: "cancelled", task }`
- `{ outcome: "conflict" }`
- `{ outcome: "approval_invalid" }`
- `{ outcome: "lease_expired" }`
- `{ outcome: "stale_fence" }`
- `{ outcome: "not_available" }`

Infrastructure failures must remain distinguishable internally as retryable/non-retryable store errors, with safe public messages and structured redacted telemetry. Do not convert every driver exception to `false` and lose operational diagnosis. Existing adapters may map these outcomes to legacy booleans temporarily, but must log safe internal classifications.

## 6. Critical adapter corrections required before driver implementation

### P0 — approval transition compatibility

The current approval adapter hardcodes `awaiting_approval → running`, while the domain lifecycle requires an explicit `approved` state before `begin_execution`. Replace the legacy seam with a versioned atomic claim API; do not patch only the SQL.

### P0 — worker identity

The lease adapter currently validates task ID and owner ID, but the durable operation must also bind the lease to a trusted worker identity. A browser-supplied worker ID is not trusted identity.

### P0 — database-clock authority

The lease adapter validates returned expiry against an injected application clock. This can reject valid DB leases or accept leases under clock skew. The DB must decide lease validity. Before a driver is implemented, change the adapter contract so it validates expiry syntax and bounded duration metadata without treating application time as authority; DB predicates enforce active/expired state. Add skew tests.

### P0 — lease result versioning

The current adapter expects a returned version of exactly `expectedVersion + 1`. This is acceptable only if every operation increments exactly once and the durable transaction contract guarantees it. Document and test this invariant for claim, renew, settle, and cancellation.

### P1 — approval read/claim race

A read snapshot followed by claim can race. The atomic claim must re-check all snapshot bindings in the same transaction; the prior read is advisory/UI data only and never authorization.

### P1 — swallowed store errors

The approval adapter catches driver errors and maps them to false. Preserve a redacted internal error code/metric while keeping public responses non-enumerating. Avoid leaking raw DB errors or task existence.

### P1 — ID and type normalization

Domain task IDs are bounded opaque strings. Approval task versions are strings; lease adapter versions are safe integers. Select one canonical storage representation and explicit boundary conversion. Reject unsafe numeric coercion and overflow.

## 7. Test-first acceptance matrix

| Scenario | Expected result |
|---|---|
| Two simultaneous claims with same grant | Exactly one claim succeeds |
| Same approval digest replay | Rejected |
| Wrong owner or worker | Non-enumerating rejection |
| Stale task version | Conflict; no event/lease mutation |
| Wrong payload/agent/capability version | Rejected |
| Expired approval grant | Rejected using DB time |
| Expired lease | Renew/settle rejected using DB time |
| Reclaimed task + old fence | Old worker cannot renew or settle |
| Concurrent renewals | At most one CAS winner |
| Cancellation vs settlement race | Exactly one terminal transition |
| Transaction failure after grant consumption | Entire transaction rolls back |
| Event append failure | State and lease changes roll back |
| Duplicate idempotency key + same payload | Same stable result |
| Duplicate idempotency key + different payload | Typed conflict |
| Application clock ± skew | No effect on DB lease authorization |
| Browser role direct table/RPC access | Denied |
| Runtime role modifies historical event | Denied |
| Cross-tenant read/write | Non-enumerating rejection |

Concurrency tests must use independent database connections and deterministic barriers, not arbitrary sleeps.

## 8. Zero-budget implementation alternatives

Ranked options:

1. **PostgreSQL 17 disposable GitHub Actions service** — recommended integration target after the schema and API contract are approved; no paid managed DB required.
2. **Existing in-memory repository + contract test suite** — keep as fast unit-test adapter; never label durable or production-ready.
3. **SQLite disposable test adapter** — optional lightweight local test path only if SQL portability is maintained; it cannot prove PostgreSQL locking/RLS/role behavior.
4. **Supabase PostgreSQL** — only if backend ownership is confirmed and live project use is separately approved. Do not use current production project for disposable race tests.

Do not add a runtime database dependency until the provider and deployment runtime are confirmed. CI-only test dependencies can be introduced later with lockfile review and license/security checks.

## 9. Implementation order

1. Approve this provider-neutral operation contract.
2. Add adapter contract tests and a deterministic fake driver.
3. Reconcile the domain lifecycle and approval service around the explicit `approved` state.
4. Remove application-clock authority from durable lease acceptance.
5. Draft provider-neutral PostgreSQL 17 schema/RPC proposal outside migration directories.
6. Add isolated PostgreSQL 17 CI harness and prove race/rollback/security scenarios.
7. Implement server-only driver and map typed outcomes to existing application interfaces.
8. Run full frontend, browser/accessibility, unit, contract, and PostgreSQL integration CI.
9. Perform security and data-integrity audit.
10. Request separate human approval before any live backend migration, credentials, provider activation, paid service, or deployment.

## 10. Phase outcome

**PARTIAL — unified contract specified from inspected source; implementation and PostgreSQL execution NOT TESTED.**

No runtime code was changed in this phase. The next code phase should begin with tests for the explicit approval state transition and clock-skew-safe lease contract, not with a live SQL migration.
