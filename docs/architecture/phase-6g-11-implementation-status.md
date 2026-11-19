# Phase 6G.11 — Implementation Status

Status: PARTIAL BUILD — runtime tests and durable database implementation are not verified.
Branch: feat/infiniteX-zero-budget-implementation

## Changes committed

- `server/ai/approval-protocol-adapter.mjs`: worker claims now require and forward `approvalTokenDigest`. The durable driver can bind the claim to the same one-time grant digest that was persisted during approval.
- `tests/approval-protocol-adapter.test.mjs`: claim contract fixture and assertion now verify the digest is forwarded.
- `server/ai/two-stage-approval-service.mjs`: adds a separate trusted-server composition boundary for approval-grant issuance and worker claiming. It loads canonical task snapshots, delegates trusted principal resolution to the protocol adapter, authorizes approval, hashes the raw token, persists only the digest through the shared durable driver, and returns the raw token only for a newly issued grant.
- `tests/two-stage-approval-service.test.mjs`: adds service-level contract tests for digest-only persistence, claim binding, authorization denial, identity spoofing, malformed tokens, and task-state validation.

## Required grant-store contract

The adapter's `issueApprovalGrantV1(request)` and `claimApprovedTaskV1(request)` must use the same durable driver/database. The driver's issuance operation must atomically:
1. Verify the task is awaiting approval under the owner-scoped predicate.
2. Compare task version, payload hash, agent, and capability bindings.
3. Insert the approval grant digest, expiry, and idempotency record.
4. Transition the task to approved and append its event.
5. Commit all writes in one transaction using database time.

The raw token must never be persisted or logged. The service returns it only when the store reports a newly issued grant. An idempotent retry may return `already_issued` without the raw token; this is intentional because the raw token is not recoverable from a digest. The caller must securely retain the first response.

The `claimApprovedTaskV1` driver operation must atomically validate and consume the matching grant digest while claiming the approved task and creating its lease. Both operations must share the same transactional grant records.

## Deliberate execution safety boundary

The new service does NOT invoke the capability executor. Lease renewal, fencing-aware settlement, cancellation, and their durable transaction contracts are not yet implemented. Enabling execution before those operations exist would create a claimed-running task without a complete recovery and settlement lifecycle.

The legacy `approved-capability-service.mjs` remains unchanged as a compatibility implementation. It is not proof of the new two-stage protocol.

## Remaining work

1. Implement a deterministic fake grant/lease store matching the durable contract.
2. Add lease renewal, settlement, cancellation, and fencing operations to the versioned adapter.
3. Add service tests proving executor invocation is impossible before a validated claim and lifecycle readiness.
4. Implement PostgreSQL 17 integration tests in disposable GitHub Actions infrastructure.
5. Run all regression tests, build, browser/accessibility checks, and security audit; capture exact CI evidence.
6. Keep merge, production migration, and deployment blocked until human release approval.

## Verification labels

- BUILD: PARTIAL — source and contract tests committed.
- TEST: NOT TESTED — no local or CI execution evidence recorded for these commits.
- DURABLE POSTGRES DRIVER: NOT IMPLEMENTED / NOT VERIFIED.
- AUDIT: PENDING.
- RELEASE: BLOCKED.

No production deployment, merge, live database migration, secret change, or paid-service activation was performed.