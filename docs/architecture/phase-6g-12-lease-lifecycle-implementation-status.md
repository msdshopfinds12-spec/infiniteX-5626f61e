# Phase 6G.12 — Lease Lifecycle Implementation Status

Date: 2026-11-20
Branch: `feat/infiniteX-zero-budget-implementation`
Status: ADAPTER + TEST-FAKE CONTRACT IMPLEMENTED; DURABLE DRIVER NOT IMPLEMENTED

## Scope completed

The provider-neutral approval protocol adapter now exposes three optional, versioned lifecycle operations:

- `renewExecutionLeaseV1`
- `settleExecutionV1`
- `cancelApprovedOrRunningTaskV1`

The adapter derives principal and worker subjects through trusted resolvers, validates bounded lease duration, positive safe-integer fencing/task versions, idempotency keys, settlement target states, result digests, failure-code length, typed outcomes, lease tuple binding, and exactly-one task-version increment on successful lifecycle transitions.

The in-memory test fake models:
- database-clock-style expiry checks using a deterministic test clock;
- worker + owner + lease ID + fencing-token + expected-version checks;
- renewal with version increment and idempotent replay;
- settlement to succeeded/failed with lease removal;
- cancellation from approved/running and active lease invalidation;
- append-only event behavior in the fake;
- injected transaction failures before state mutation.

A new test file, `tests/execution-lifecycle-contract.test.mjs`, covers renewal replay, expiry rejection, terminal settlement, cancellation fencing, rollback behavior, and malformed identity/version/status inputs.

## Important limitations

- The fake is test-only and in-memory. It is not durable, distributed, crash-safe, or evidence of PostgreSQL locking/isolation.
- No PostgreSQL 17 schema, SQL function, driver, row-level security policy, or real concurrent transaction test was added.
- The adapter treats returned expiry as canonical ISO metadata only. The production database must remain the authority for lease expiry using database time.
- The executor remains disabled. No capability execution is started by these lifecycle methods.
- No production secret, credential, migration, deployment, billing action, or production database mutation was performed.
- Existing legacy adapters/services remain intact; no compatibility migration or caller cutover was performed.

## Production acceptance gates still open

1. Review and approve one canonical task schema, status model, lock order, idempotency scope, and event sequencing contract.
2. Implement PostgreSQL 17 transactions for grant issuance, claim, renewal, settlement, and cancellation. Every operation must enforce owner/tenant scope and DB-clock expiry atomically.
3. Enforce append-only events, unique owner-scoped idempotency, one-time grant digest consumption, monotonic fencing, and active-lease invariants in the database.
4. Add real PostgreSQL integration tests for competing claims, renewal/settlement races, cancellation races, stale workers, expired leases, rollback, retry/replay, and crash recovery.
5. Perform a security review of authentication, worker credentials, tenant isolation, RLS, event redaction, and service-role access.
6. Only after all gates pass, request explicit approval before configuring secrets, enabling execution, migrating data, or deploying.

## Verification status

The feature-branch CI was triggered after the adapter/fake/test changes. Results must be read from the workflow run for the latest commit; a running workflow is not a pass. Local test execution was not available through this GitHub connector session.

## Design decision

Preferred production alternative: PostgreSQL 17 with short, explicit transactions and conditional updates/row locks. An alternative durable database is acceptable only if it proves equivalent atomic compare-and-set, DB-authoritative expiry, monotonic fencing, owner scoping, idempotency, and append-only audit semantics. Process-local memory remains development/test-only.
