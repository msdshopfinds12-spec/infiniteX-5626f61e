# Phase 6G.9C — Contract Reconciliation & PostgreSQL 17 Harness Plan

Status: DESIGN BASELINE — REVIEW REQUIRED; NO DATABASE EXECUTION
Branch: `feat/infiniteX-zero-budget-implementation`
Scope: source-backed contract reconciliation and disposable integration-harness specification.
Safety: documentation-only. No migration, SQL execution, database connection, credentials, package installation, deployment, or production mutation.

## 1. Decision summary

The repository already has two distinct task abstractions:

1. A deterministic domain lifecycle in `src/lib/task-lifecycle.mjs`, used by the in-memory repository.
2. An approval-specific storage seam in `server/ai/approval-task-store-adapter.mjs`, plus a lease-fenced store seam in `server/integrations/task-lease-store-adapter.mjs`.

They are related but are not yet one coherent durable-store contract. Do not write a PostgreSQL driver until their state vocabulary, identity types, version semantics, and atomic method results are explicitly reconciled.

**Selected direction:** retain the domain lifecycle as the provider-neutral state machine; define a durable execution aggregate that adds leases/fencing without weakening the approval boundary; use PostgreSQL 17 only as a disposable integration-test target after the backend/provider decision is made.

## 2. Source-backed current behavior

### 2.1 Domain lifecycle

Current source: `src/lib/task-lifecycle.mjs`

- States: `queued`, `planning`, `awaiting_approval`, `approved`, `running`, `succeeded`, `failed`, `cancelled`.
- Domain task ID is a bounded string (1–64 safe characters), not a UUID.
- Task version is a non-negative integer starting at 0.
- The in-memory lifecycle event sequence is assigned as `task.version + 1`.
- Domain transition timestamps are supplied to the pure state machine; it validates canonical UTC format and non-decreasing order.
- User approval is a distinct state transition; system actors cannot approve.
- The lifecycle module records state only and does not execute tools.

### 2.2 In-memory repository

Current source: `src/lib/task-repository.mjs`

- Bounded `Map` storage; synchronous within one process only.
- Immutable snapshots and bounded event history.
- Read-check-write is atomic only within the current Node event loop.
- It is not durable, distributed, multi-process safe, or a production database adapter.

### 2.3 Approval storage adapter

Current source: `server/ai/approval-task-store-adapter.mjs`

- Principal subject is passed from a trusted server-side principal object.
- Reads require task ownership and `awaiting_approval` status.
- Current approval claim operation is `claimApprovedTask`; it compares task version, payload hash, agent identity/version, capability identity/version, and state transition.
- A separate optional `claimApprovedTaskWithApproval` operation accepts a token digest, not a raw token.
- The adapter fails closed if the atomic approval-claim operation is unavailable or returns anything other than boolean true.

### 2.4 Lease-fenced storage adapter

Current source: `server/integrations/task-lease-store-adapter.mjs`

Required store operations:
- `claimTaskWithLease`
- `renewTaskLease`
- `completeTaskWithLease`
- `failTaskWithLease`

Required lease tuple: task ID, owner ID, lease ID, positive fencing token, expected task version. Renewal and settlement reject caller-supplied `now`. The durable store contract requires database-clock expiry predicates and atomic conditional writes.

**Important boundary:** the current adapter's injected application clock is used to validate returned lease expiry bounds. A production DB driver must not interpret that application clock as authority for expiry. Before a concrete driver is implemented, decide whether response-shape validation should validate only timestamp format and duration policy, while the database alone enforces whether a lease is currently valid. Test clock skew explicitly.

## 3. Contract conflicts to resolve

### P0 — Identity type mismatch

The proposed 6G.9A database model uses UUID task/owner IDs. Existing domain tasks use string IDs and the approval adapter uses a principal subject string. A driver cannot silently cast or assume every subject is a UUID.

**Decision required:** introduce explicit storage IDs and a stable owner-subject mapping, or revise the schema to preserve opaque provider-neutral subject IDs. Do not overload a task display ID as a database primary key.

### P0 — State vocabulary mismatch

Current domain states include planning and approval states. The 6G.9A proposal compresses states into queued/running/completed/failed/cancelled. Existing approval SQL uses `awaiting_approval` and `running`; domain success is `succeeded`, while the proposal says `completed`.

**Recommended canonical mapping:**

| Domain state (current) | Durable state | Notes |
|---|---|---|
| queued | queued | Task is accepted, not yet planned |
| planning | planning | Planning is an explicit lifecycle stage |
| awaiting_approval | awaiting_approval | Human approval required; not claimable |
| approved | approved | Approval recorded; not yet leased |
| running | running | Must have a complete active lease tuple |
| succeeded | completed | Explicit adapter mapping; do not silently rename domain state |
| failed | failed | Retry only through an explicit retry operation |
| cancelled | cancelled | Terminal |

Keep the domain API vocabulary stable initially. Any future domain rename requires a separate migration plan and compatibility tests.

### P0 — Approval claim and lease claim are separate seams

The approval adapter currently transitions `awaiting_approval → running` via `claimApprovedTaskWithApproval`; the lease adapter claims a task and returns a lease snapshot. A production path must not commit the approval claim and then separately attempt lease creation.

**Required unified operation:** one transaction consumes the exact approval grant, transitions the task to running, creates/replaces the lease, increments the persistent fencing token, increments task version, allocates event sequence, and returns the complete claimed snapshot. Any failure rolls back all changes.

The lower-level adapter methods may remain for compatibility/testing, but the production orchestration path must use the unified atomic operation.

### P0 — Version and event-sequence semantics

The domain lifecycle uses version as event sequence today. The durable contract needs independent counters because a single state transition may append multiple events and operational metadata may evolve without a domain-state change.

**Required durable fields:** `task_version BIGINT`, `event_seq BIGINT`, and `fencing_token BIGINT`. Allocate event sequence under the task-row lock and append event in the same transaction. Preserve a mapping to the domain's event list; never derive durable event sequence from task version.

### P1 — Retry and terminal-state semantics

The current domain lifecycle has no explicit retry command. The proposed SQL contract mentions failed → queued retry. Do not add this silently.

**Decision required:** define a new explicit `retry_failed_task` command with owner authorization, expected version, idempotency key, retained historical events, and a new execution epoch. Completed/cancelled remain terminal. Failed remains terminal unless the explicit retry command is approved.

### P1 — Time authority and clock skew

Domain event timestamps are supplied to a pure deterministic state machine, while lease validity must be database-clock controlled.

**Required separation:**
- Domain event timestamp: trusted service timestamp for deterministic domain history, validated by the state machine.
- Lease expiry and renewal eligibility: database time only.
- Approval expiry: database time only.
- Client/browser time: display only, never authorization or concurrency authority.

Tests must cover application/database clock skew in both directions.

### P1 — Result type contract

The approval adapter returns booleans for claim outcomes; the lease adapter returns a snapshot or null for claim/renew and boolean for complete/fail. A durable driver should expose a stable typed outcome internally, and adapters should map it consistently.

Recommended internal outcomes:
- `CLAIMED` with complete snapshot
- `CONFLICT` (stale version/state/idempotency)
- `APPROVAL_INVALID` (without cross-tenant enumeration)
- `LEASE_EXPIRED`
- `STALE_FENCE`
- `NOT_AVAILABLE` (non-enumerating)
- `RETRYABLE_STORE_ERROR`

Do not collapse infrastructure failures into business conflicts inside the database driver; preserve safe error classification for observability.

## 4. Proposed durable aggregate

One durable task row should hold the current authoritative state:

- Internal task UUID primary key (if chosen after ID mapping review)
- Owner subject / tenant key
- Domain task ID (unique within owner scope)
- Domain status
- Task version
- Event sequence counter
- Fencing token counter
- Canonical payload and payload hash
- Idempotency key and hash
- Agent and capability immutable version bindings
- Current lease ID, authenticated worker reference, expiry
- Created/updated timestamps from database clock

Separate tables:
- Approval grants: one-time digest, exact binding tuple, expiry, consumed time and consuming fence
- Task events: append-only, unique (task_id, seq), event type allow-list, bounded redacted metadata
- Optional execution attempts: only if retry/attempt history cannot be represented safely by task events

Use foreign keys and explicit retention policy. Do not cascade-delete audit history without an approved data-retention decision.

## 5. PostgreSQL 17 disposable harness — proposed design

No PostgreSQL driver, database service, or integration harness is currently established by the inspected package manifest/workflows. Do not add a runtime database dependency just to test a schema that is not yet approved.

### 5.1 Isolation and zero-budget approach

Preferred first harness: GitHub Actions service container pinned to PostgreSQL 17, with a fresh database per workflow job. This avoids connecting to Ashaa-INX or any production backend. If a local Docker runtime is available, the same SQL test suite may run in a disposable container. Do not require a paid managed database.

### 5.2 Proposed future files (not created in this phase)

- `tests/postgres/README.md` — local/CI setup, safety, cleanup, prerequisites
- `tests/postgres/bootstrap.sql` — test-only roles/schemas/fixtures
- `tests/postgres/contract.test.mjs` — deterministic lifecycle and permissions checks
- `tests/postgres/concurrency.test.mjs` — independent-connection races
- `tests/postgres/helpers/db.mjs` — connection and transaction helpers
- `.github/workflows/postgres-integration.yml` — pinned PostgreSQL 17 service and CI job
- `supabase/proposals/` or `db/proposals/` — review-only SQL, chosen after provider decision

Do not add any file under executable migration directories until a separate explicit migration approval.

### 5.3 Test harness requirements

- PostgreSQL major version pinned to 17; no `latest` tag.
- Fresh isolated database per CI run; no production URLs or secrets.
- Separate low-privilege browser/anonymous role and trusted server role.
- Independent connections for races; use advisory barriers or explicit coordination rather than timing sleeps.
- Deterministic fixtures and fixed test payloads; no real user data.
- Transaction rollback after every test or disposable database teardown.
- Capture server version, test count, duration, and failed assertion; never log secrets/payloads.
- Test idempotent schema bootstrap in the disposable test environment only.
- CI must fail closed if database service is unavailable; do not silently skip integration tests and report green.

### 5.4 Mandatory test scenarios

1. Fresh schema bootstrap succeeds.
2. Repeated bootstrap behavior is explicitly deterministic (idempotent or expected fail with clear reason).
3. One approval grant, two concurrent claim connections: exactly one winner.
4. Two claims with same task version: at most one winner.
5. Each successful claim/reclaim increments fencing token exactly once.
6. Old fencing token cannot renew, complete, or fail after reclaim.
7. Expired lease cannot renew or settle, even if application clock is skewed.
8. Renewal races: at most one update for the same expected version.
9. Approval replay, expiry, wrong owner, wrong task version/hash/agent/capability are rejected.
10. Failure injection proves task, grant, lease, and event changes roll back together.
11. Same owner/idempotency key + same canonical payload returns same task.
12. Same owner/idempotency key + different payload returns typed conflict.
13. Event sequence remains unique and monotonic under concurrent operations.
14. Browser/anonymous role cannot read/write private tables or execute privileged lifecycle RPCs.
15. Runtime role cannot update/delete append-only event rows.
16. Cross-tenant reads and mutations return non-enumerating outcomes.
17. Database/app clock skew tests prove database time is authoritative.
18. Query plans/indexes are checked for critical owner/task/expiry lookups at representative synthetic volume.

## 6. Adapter mapping — required before implementation

| Existing seam | Unified durable operation | Adapter mapping |
|---|---|---|
| `claimTaskWithLease` | `claim_approved_task_v1` | Return complete running snapshot |
| `renewTaskLease` | `renew_task_lease_v1` | Snapshot or null for stale/expired |
| `completeTaskWithLease` | `complete_task_v1` | True only for one fenced transition |
| `failTaskWithLease` | `fail_task_v1` | True only for one fenced transition |
| `claimApprovedTaskWithApproval` | `claim_approved_task_v1` | Same atomic operation; do not call a separate claim |
| approval snapshot read | owner-scoped task read | Return only approved fields |
| task lifecycle transition | purpose-built state RPC | Domain errors mapped from stable database outcomes |

A final signature-level mapping table must be generated from tests and source before driver code is written.

## 7. Gate sequence

### Gate 1 — contract decision
- [ ] Approve domain-to-durable state mapping.
- [ ] Approve task/owner ID mapping.
- [ ] Approve retry semantics.
- [ ] Approve typed result/error mapping.
- [ ] Approve single atomic approval+lease claim.
- [ ] Confirm backend owner and worker identity model.

### Gate 2 — review-only SQL
- [ ] Produce provider-neutral PostgreSQL 17 DDL and RPC proposal.
- [ ] Include constraints, grants, event append-only controls, lock order, and database-clock rules.
- [ ] Static review of every function and privilege.
- [ ] Keep proposal outside migration directories.

### Gate 3 — disposable harness
- [ ] Add pinned PostgreSQL 17 CI service.
- [ ] Add independent-connection concurrency tests.
- [ ] Prove rollback, replay, fencing, role boundaries, and clock-skew behavior.
- [ ] Record actual CI run URLs and outcomes.

### Gate 4 — driver
- [ ] Implement server-only driver only after Gates 1–3 pass.
- [ ] Preserve existing adapter compatibility or version the adapter contract deliberately.
- [ ] Add contract tests before any backend selection-specific code.

### Gate 5 — live approval
Separate explicit human approval is mandatory for credentials, provider activation, live migrations, production data changes, paid services, or deployment.

## 8. Current phase outcome

**Status: PARTIAL — source inspection and design reconciliation documented; no PostgreSQL runtime harness executed.**

This phase does not claim PostgreSQL 17 is installed, connected, or tested. The repository currently has Node built-in tests and frontend/browser CI; actual PostgreSQL integration evidence remains NOT TESTED.

The next safe action is to review and approve the state/identity/atomic-claim decisions, then create the review-only PostgreSQL 17 schema proposal and disposable CI harness. Do not jump directly to production SQL or driver implementation.
