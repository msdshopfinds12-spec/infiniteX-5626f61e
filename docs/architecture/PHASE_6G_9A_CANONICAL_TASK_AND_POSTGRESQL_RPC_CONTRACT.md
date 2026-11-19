# Phase 6G.9A — Canonical Task Model & PostgreSQL RPC Contract

Status: PROPOSED CONTRACT — DESIGN REVIEW REQUIRED
Scope: documentation only; no schema, database, runtime, or production changes.
Target branch: `feat/infiniteX-zero-budget-implementation`
Predecessor: `PHASE_6G_9_POSTGRESQL_DRIVER_READINESS.md`

## 1. Decision and non-goals

This document defines a provider-neutral task lifecycle and a proposed PostgreSQL RPC boundary. It does not authorize a driver, migration, Supabase connection, credential creation, deployment, or production release.

The exact mapping to the repository's current TypeScript interfaces remains a required review step before implementation. In particular, do not silently rename or weaken existing adapter methods to fit this proposal.

## 2. Canonical task record

A task is the durable unit of work. Its identity and execution binding are immutable after creation except through an explicitly versioned, authorized task-revision operation.

Required fields:

| Field | Type | Contract |
|---|---|---|
| id | UUID | Server-generated primary key |
| owner_id | UUID | Trusted authenticated principal; never accepted from an untrusted browser payload |
| status | enum | queued, running, completed, failed, cancelled |
| version | BIGINT | Monotonic optimistic-concurrency version; starts at 1 |
| fencing_token | BIGINT | Monotonic per-task execution epoch; starts at 0 and increments on every successful claim/reclaim |
| event_seq | BIGINT | Monotonic per-task event sequence; independent from task version |
| payload | JSONB | Validated, size-bounded canonical input |
| payload_hash | BYTEA | SHA-256 of canonical payload bytes |
| idempotency_key | TEXT | Owner-scoped unique key, bounded length |
| agent_id / agent_version | TEXT | Immutable execution identity |
| capability_version | TEXT | Immutable capability contract version |
| lease_id | UUID nullable | Present only while running |
| lease_owner | TEXT nullable | Server-issued worker identity, not a user identity |
| lease_expires_at | TIMESTAMPTZ nullable | Database-clock expiry |
| created_at / updated_at | TIMESTAMPTZ | Database-generated timestamps |

The database must enforce: `version >= 1`, `fencing_token >= 0`, `event_seq >= 0`, bounded payload size, and status/lease consistency. A non-running task must not retain an active lease tuple. A running task must have a complete lease tuple.

### Status transitions

Allowed transitions:

- queued → running (successful atomic approval consumption + claim)
- queued → cancelled (authorized cancellation)
- running → running (successful lease renewal; version increments)
- running → completed (fenced completion)
- running → failed (fenced failure)
- running → running (expired-lease recovery/reclaim; fencing token increments)
- failed → queued only through an explicit retry operation that creates a new execution epoch and preserves prior events
- completed and cancelled are terminal

No generic status-update RPC is permitted. Every transition must use a purpose-built transactional operation and append its event in the same transaction.

## 3. Canonical event record

Events are append-only and scoped to a task:

- `id UUID`
- `task_id UUID`
- `owner_id UUID`
- `seq BIGINT` — unique per task, strictly increasing
- `task_version BIGINT`
- `fencing_token BIGINT`
- `event_type TEXT` from a closed allow-list
- `actor_type TEXT` (system, user, worker)
- `actor_ref TEXT nullable` (non-secret stable reference)
- `correlation_id UUID nullable`
- `metadata JSONB` — bounded allow-listed metadata only
- `created_at TIMESTAMPTZ` — database generated

Enforce `UNIQUE(task_id, seq)`. Never store raw approval tokens, credentials, authorization headers, or unrestricted worker output in event metadata. Event sequence allocation and event insertion must occur in the same transaction as the task mutation.

## 4. Approval grant

An approval grant is single-use and bound to the exact execution being authorized:

- grant ID, owner ID, task ID
- expected task version
- payload hash
- agent ID and agent version
- capability version
- cryptographic token digest (never raw token)
- expiry timestamp from the database clock
- consumed timestamp and consuming fencing token

A grant is invalid if any binding differs, it is expired, or it has already been consumed. Store a keyed digest (for example HMAC-SHA-256 with a server-held secret) when token-verification design requires resistance to offline token guessing. Secret material must never be stored in the database or browser bundle.

## 5. Proposed RPC boundary

These are logical signatures, not executable SQL and not yet a commitment to PostgREST naming. Use typed composite results or stable JSON results with explicit schema versioning. All operations must be transactional.

| RPC | Inputs (logical) | Required behavior |
|---|---|---|
| `task_create_v1` | canonical payload, idempotency key, agent/capability versions | Derive owner from trusted auth context; same owner/key + same hash returns existing task; different hash returns conflict |
| `approval_issue_v1` | task ID, expected version, token digest, expiry, approval binding | Server-authorized issuance; persist digest only; append issued event |
| `task_claim_approved_v1` | task ID, grant ID, presented token, expected task version, worker ref, lease duration | Lock task and grant deterministically; verify all bindings; consume grant; increment fencing token; create lease; increment version; append claimed event; return complete lease tuple |
| `task_lease_renew_v1` | task ID, expected version, lease ID, fencing token, worker ref, extension | Conditional update only when owner, running state, full lease tuple, version and unexpired DB-time lease match; preserve lease ID and fencing token; increment version; append renewed event |
| `task_complete_v1` | task ID, expected version, lease ID, fencing token, worker ref, bounded result reference | Fenced conditional settlement; clear lease; increment version; append completed event atomically |
| `task_fail_v1` | task ID, expected version, lease ID, fencing token, worker ref, normalized error code | Same fenced predicate as completion; clear lease; increment version; append failed event atomically |
| `task_recover_expired_v1` | task ID, expected version, new worker ref, lease duration | Only expired running task can be reclaimed; increment fencing token and version; replace lease; append recovery event |
| `task_cancel_v1` | task ID, expected version, reason code | Owner-authorized conditional transition; clear lease only under defined cancellation policy; append event |

The server-side driver must map every RPC result to the existing adapter contract without dropping task version, lease ID, fencing token, expiry, or conflict information.

## 6. Mandatory atomicity and concurrency invariants

1. Approval consumption and claim are one transaction. There is no intermediate committed state where a grant is consumed but the task remains unclaimed.
2. A successful claim or reclaim increments the persistent fencing token exactly once.
3. Renewal, completion, and failure require the full active lease tuple and expected task version.
4. Every lease validity check uses database time (`clock_timestamp()` or a carefully selected transaction-time policy); client clocks are never authoritative.
5. A stale worker's renew/complete/fail operation affects zero task rows and appends no event.
6. A failed transaction leaves task, grant, and event state unchanged.
7. Event sequence allocation is serialized per task and unique; it is not inferred from task version.
8. A duplicate idempotency key with a different payload hash returns a typed conflict, never silently reuses the task.
9. Worker output and error metadata are size-bounded and normalized before persistence.
10. RPCs return explicit outcomes (success, conflict, expired, invalid grant, stale lease, not found) without leaking whether another tenant owns a resource.

## 7. Security and privilege model

- Browser roles receive no direct table privileges on private tasks, grants, or events.
- Only a trusted server-side execution path may call privileged lifecycle RPCs.
- If the eventual backend is Supabase, derive the end-user principal from verified `auth.uid()`; never accept an arbitrary owner ID as authorization. The service-role key must remain server-only.
- If the backend is not Supabase, use its equivalent verified principal mechanism; do not assume Supabase semantics.
- Any `SECURITY DEFINER` function must set a fixed safe `search_path`, schema-qualify objects, validate inputs, and have EXECUTE revoked from PUBLIC/anon/authenticated unless explicitly required.
- Grant only the minimum required EXECUTE privileges to the server role.
- RLS is defense in depth, not a substitute for RPC authorization.
- Never log raw approval tokens, secrets, full payloads, or authorization headers.

## 8. Required disposable PostgreSQL 17 test matrix

Before a concrete driver is implemented, test against an isolated disposable PostgreSQL 17 database:

- clean install and safe second-apply behavior;
- concurrent claim race: exactly one winner for one grant;
- concurrent renewal race: at most one winner for the same expected version;
- claim/reclaim increments fencing token monotonically;
- old worker cannot renew, complete, or fail after reclaim;
- expired leases cannot renew or settle;
- replayed, expired, wrong-owner, wrong-version, wrong-hash, wrong-agent, and wrong-capability grants are rejected;
- rollback leaves grant unconsumed, task unchanged, and no event appended;
- same idempotency key + same payload returns the same task;
- same idempotency key + different payload returns conflict;
- event sequence uniqueness under concurrent mutations;
- browser/anonymous roles cannot read or mutate private tables or invoke privileged RPCs;
- logs and persisted metadata contain no raw secrets or approval tokens.

Use deterministic barriers and independent database connections for concurrency tests; sequential tests do not prove race safety.

## 9. Alternatives and decision criteria

**Preferred, if PostgreSQL ownership is confirmed:** row-level transactions, conditional updates, durable fencing counter, and transactional event append.

**Alternative durable store:** acceptable only if it can prove atomic compare-and-set, monotonic fencing, single-use approval consumption, and atomic task+event writes under concurrency.

**Demo-only fallback:** current in-memory adapter, clearly labeled volatile, single-process, and unsuitable for multi-instance workers or durable execution.

**Not acceptable:** browser-direct database writes, client-supplied owner identity, expiry-only leases, split approval/claim transactions, fake persistence, or production migrations from an unvalidated proposal.

## 10. Exit criteria for Phase 6G.9A

- [ ] Maintainer review confirms this model matches the existing task and event domain types.
- [ ] Maintainer review maps each proposed RPC to exact adapter method signatures and result types.
- [ ] Status transitions and retry semantics are accepted.
- [ ] Event sequencing and task-version semantics are accepted.
- [ ] Backend owner and trusted authentication mechanism are confirmed.
- [ ] No SQL migration or driver implementation is started until the above are resolved.

## 11. Next phases

- **6G.9B:** update the review-only SQL proposal to implement the approved contract; still no live migration.
- **6G.9C:** run PostgreSQL 17 integration, concurrency, replay, rollback, and privilege tests on disposable infrastructure.
- **6G.9D:** implement the server-only driver behind existing adapters only after contract tests pass.
- **6G.9E:** security audit and CI verification.
- **6G.9F:** separate explicit approval required for any confirmed-backend migration or deployment.

Release remains blocked until every required test passes, security review is complete, backend ownership is confirmed, and the user explicitly approves live changes.
