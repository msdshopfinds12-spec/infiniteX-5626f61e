# Phase 6G.11 — Two-Stage Execution: Architecture Plan

Status: PLAN ONLY — implementation and runtime verification pending.
Target branch: feat/infiniteX-zero-budget-implementation
Scope: trusted approval, worker claim, lease lifecycle, and durable-store contract.
Release policy: no merge, production deployment, production migration, billing, or secret changes.

## 1. Verified current-state constraints

- `approval-protocol-adapter.mjs` exposes versioned approval and worker-claim operations and requires trusted principal/worker resolvers.
- The adapter delegates durability and atomicity to an injected store. It does not implement persistence or execute capabilities.
- `approval-authority.mjs` is explicitly process-local and non-durable. Its grants disappear on process restart.
- `approved-capability-service.mjs` remains a legacy one-step compatibility service. Its legacy transition must not be represented as the new two-stage protocol.
- `approval-task-store-adapter.mjs` is also a legacy bridge and transitions directly from awaiting approval to running.
- No production PostgreSQL durable driver has been verified in this review.

## 2. Critical protocol gap — approval grant issuance

The current adapter method `approveTaskWithGrantV1` accepts an `approvalTokenDigest` and asks the store to consume/validate it while moving a task to approved. The reviewed in-memory authority issues its own token but does not persist a grant digest in the durable store. These are not yet a connected lifecycle.

Before execution-service implementation, define one coherent grant lifecycle:

1. Generate a high-entropy URL-safe raw token only inside trusted server code.
2. Hash it with SHA-256; persist only the digest, never the raw token.
3. Persist the grant binding (owner subject, task ID/version, payload hash, agent/capability IDs and versions, expiry, single-use state) using database time.
4. Atomically approve the task and create the grant record, or define an equally strong transaction boundary that cannot leave an approved task without its intended grant.
5. Return the raw token exactly once to the authorized approval caller.
6. On worker claim, atomically validate and consume the digest, owner/task/version/payload binding, expiry, idempotency key, and worker identity while transitioning approved -> running and creating a lease.
7. Retries must return the original idempotent result without re-consuming a grant or creating a second execution.

The preferred interface is a new explicitly versioned operation such as `issueApprovalGrantV1` (or a renamed, fully specified approval operation), followed by `claimApprovedTaskV1`. Do not silently change the semantics of the existing method without updating its contract, tests, and docs together.

## 3. Target state machine

```text
awaiting_approval
  -- authorized owner approval + grant persistence -->
approved
  -- authenticated worker + valid one-time grant + atomic claim -->
running
  -- valid lease holder + current fencing token -->
completed | failed | cancelled
```

Terminal states are immutable. A stale worker must never settle or renew a task after its lease expires, is replaced, or its fencing token is superseded.

## 4. Required service boundaries

Create a separate versioned two-stage service. Keep `approved-capability-service.mjs` as a documented compatibility implementation until a separately approved migration.

The new service must:
- load canonical task state from server-owned storage;
- derive owner and worker subjects only from trusted authentication context;
- canonicalize and hash the immutable execution payload;
- issue and return a one-time grant only after durable approval succeeds;
- claim through the durable adapter before invoking the executor;
- invoke the executor only when the validated claim outcome is `claimed`;
- pass a server-controlled AbortSignal and immutable payload snapshot;
- renew leases with DB-time expiry checks and fencing-token compare-and-swap;
- settle success/failure only when task, lease ID, worker subject, and fencing token still match;
- support cancellation through an owner-authorized durable transition;
- fail closed on store, auth, validation, and lease errors;
- normalize public errors without leaking SQL, tokens, or internal secrets.

No execution may begin merely because an approval token is syntactically valid.

## 5. Durable-store contract

Every state-changing operation must be one database transaction containing all related task, grant, lease, event, and idempotency writes.

Required versioned operations:
- `issueApprovalGrantV1`
- `claimApprovedTaskV1`
- `renewExecutionLeaseV1`
- `settleExecutionV1`
- `cancelApprovedOrRunningTaskV1` (with explicit rules for running-task cancellation)

Required invariants:
- owner/tenant-scoped predicates on every read and write;
- DB time, not application wall-clock time, for grant and lease expiry;
- compare-and-swap on task version and expected status;
- single-use grant consumption;
- monotonically increasing fencing token per task execution generation;
- unique idempotency scope and payload fingerprint;
- append-only event sequence committed with the state change;
- no raw approval token in database rows, logs, events, or error messages;
- no executor invocation inside a database transaction.

## 6. Deterministic fake-store contract tests

Build a deterministic in-memory fake strictly for tests. It must implement the same public contract as the durable driver and expose controlled clock advancement and deterministic token generation.

Test at minimum:
- successful approval/grant issuance and successful claim;
- wrong owner, spoofed principal, spoofed worker, stale task version, wrong payload hash;
- expired, malformed, replayed, and already-consumed grants;
- idempotent approval and claim retries;
- simultaneous competing worker claims (exactly one winner);
- lease expiry, renewal, and renewal after expiry;
- fencing-token increment and stale-token rejection;
- settlement by wrong worker, wrong lease, or stale fencing token;
- duplicate settlement and replay;
- cancellation before claim and while running;
- store failure/rollback leaves no partial task, grant, lease, or event writes;
- executor is never called unless claim outcome is validated as claimed.

The fake proves service/contract behavior only. It is not evidence of production durability or database concurrency semantics.

## 7. PostgreSQL 17 integration gate

After fake-store contracts pass, add a disposable PostgreSQL 17 service to GitHub Actions. Use isolated test-only credentials and schema. Do not connect tests to the user's Supabase project or production database.

Integration tests must exercise real transactions, unique constraints, row locks/CAS, DB-time expiry, rollback, and concurrent claim races. Teardown must be automatic. No migration may be applied to a live environment.

## 8. Execution order and acceptance gates

1. PLAN: approve this contract and settle the grant-issuance API.
2. BUILD: implement versioned adapter operations and the separate two-stage service.
3. TEST: run deterministic fake-store contract tests and all existing regression tests.
4. TEST: run PostgreSQL 17 integration tests in disposable CI.
5. AUDIT: inspect auth boundaries, ownership isolation, replay/idempotency, lease/fencing, cancellation, logs, and dependency/security checks.
6. RELEASE: human approval required before merge, deployment, or any live migration.

## 9. Explicit non-goals for this phase

- No production deployment or merge.
- No live Supabase/PostgreSQL migration.
- No paid service activation or billing changes.
- No automatic execution of arbitrary code or shell commands.
- No claim that tests pass until CI or a reproducible local run provides evidence.

## 10. Completion evidence required

Record exact commit SHA, changed paths, CI run URLs and conclusions, test counts, PostgreSQL version, integration-test results, and unresolved risks. Mark each gate VERIFIED, PARTIAL, BLOCKED, or NOT TESTED.