# Phase 6G.11 — Implementation Status

Status: PARTIAL BUILD — runtime tests and durable database implementation are not verified.
Branch: feat/infiniteX-zero-budget-implementation

## Changes committed

- `server/ai/approval-protocol-adapter.mjs`: worker claims now require and forward `approvalTokenDigest`. The durable driver can bind the claim to the same one-time grant digest that was persisted during approval.
- `tests/approval-protocol-adapter.test.mjs`: claim contract fixture and assertion now verify the digest is forwarded.
- `server/ai/two-stage-approval-service.mjs`: adds a separate trusted-server composition boundary for approval-grant issuance and worker claiming. It loads canonical task snapshots, delegates trusted principal resolution to the protocol adapter, authorizes approval, hashes the raw token, persists only the digest through the shared durable driver, and returns the raw token only for a newly issued grant.
- `tests/two-stage-approval-service.test.mjs`: adds service-level contract tests for digest-only persistence, claim binding, authorization denial, identity spoofing, malformed tokens, and task-state validation.
- `tests/helpers/fake-two-stage-approval-store.mjs` and `tests/fake-two-stage-approval-store.test.mjs`: add a deterministic test-only store model for approval, one-time digest consumption, lease creation, grant expiry, idempotent claim replay, competing claims, and rollback behavior.

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

1. Extend the deterministic fake with lease renewal, settlement, fencing-token rejection, and cancellation operations.
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

## Phase 6G.12 — Lease lifecycle contract plan (2026-11-20)

Status: PLAN REQUIRED — no lifecycle implementation or database driver is claimed.

### Why this phase is next

The current protocol stops after a successful claim and lease creation. The service intentionally does not invoke the capability executor. Without lease renewal, fencing-aware settlement, and cancellation, a worker can become stale or leave a task permanently running. Implementing an executor before these contracts would be unsafe.

### Selected lifecycle operations

All operations are versioned and delegated through the same durable driver/database used by grant issuance and worker claim:

1. `renewExecutionLeaseV1`
2. `settleExecutionV1`
3. `cancelApprovedOrRunningTaskV1`

No operation is implemented by this plan. The existing claim-only adapter remains the only verified source-level contract in this phase.

### Required request bindings

Every worker-owned mutation must include:
- task ID and expected task version;
- trusted principal/tenant subject derived server-side;
- trusted worker subject derived server-side;
- lease ID and monotonically increasing fencing token;
- idempotency key;
- operation-specific values with strict bounds.

The adapter must never trust client-supplied owner or worker subject strings. The database must independently enforce owner/tenant scoping; adapter validation is not a substitute for database authorization.

### Lease renewal contract

`renewExecutionLeaseV1` may extend only the currently active lease when all of these match:
- task status is `running`;
- owner, task, worker, lease ID and fencing token match;
- current lease has not expired according to database time;
- expected task version matches;
- requested extension is within the configured maximum.

Renewal must not change the fencing token. It must atomically update expiry, task version (if the schema chooses to version lease changes), append an event, and persist idempotency. A stale, expired, or mismatched lease returns a non-success outcome and cannot revive the task.

### Settlement contract

`settleExecutionV1` accepts only terminal outcomes `completed` or `failed`, with a bounded, schema-validated result/error envelope. It must require the current unexpired lease and exact fencing token. The database must reject stale workers even if they still possess an old lease ID.

Settlement must atomically transition `running -> completed|failed`, record a bounded result reference or sanitized error code, append an immutable event, release/close the lease, and persist idempotency. Raw secrets, tokens, stack traces, and arbitrary large payloads must not enter event records.

### Cancellation contract

`cancelApprovedOrRunningTaskV1` is owner-authorized and idempotent. It may transition `approved -> cancelled` or request cancellation of `running` work. A running task must not be marked safely cancelled until the worker/driver has acknowledged termination or the lease has expired and recovery policy has fenced the old worker. Cancellation must not erase grant, lease, or audit history.

### Fencing and transaction invariants

- Fencing tokens are monotonically increasing per task (or a stronger documented scope); never reset on retry.
- A worker mutation with a fencing token lower than the current token is rejected.
- Database time is authoritative for expiry; application clocks are advisory only.
- Task state, lease state, event sequence, and idempotency record commit or roll back together.
- Event history is append-only; no update/delete of prior event rows.
- Idempotency keys are scoped to principal, task, and operation; same key + same canonical request replays the original outcome, while same key + different request conflicts.
- All owner-scoped predicates must be enforced inside each transaction, not only before it.
- Transaction isolation and unique constraints must guarantee exactly one winning claim/settlement under concurrent requests.

### Test plan before PostgreSQL

Extend the deterministic fake and contract tests for:
- successful renewal and maximum extension bounds;
- expired lease cannot be renewed;
- stale worker and stale fencing token cannot renew or settle;
- settlement success, duplicate replay, and conflicting replay;
- cancellation before claim and during running work;
- cancellation race against settlement;
- lease expiry and recovery fencing;
- rollback leaves task, lease, event, and idempotency state unchanged.

The fake is a behavioral model only; it cannot prove PostgreSQL row locking, isolation, or transaction correctness.

### PostgreSQL 17 acceptance gate

Only after fake contract tests are reviewed, implement a disposable PostgreSQL 17 test driver and CI service. Tests must exercise concurrent claims, renewal/settlement races, owner isolation, rollback, DB-time expiry, unique idempotency constraints, append-only events, and fencing rejection. No production schema migration or Supabase mutation is in scope.

### Executor activation gate

The capability executor remains disabled from this lifecycle until:
1. all lifecycle operations exist in the adapter and durable driver;
2. PostgreSQL integration and concurrency tests pass;
3. authorization and tenant isolation are independently audited;
4. worker termination/recovery behavior is specified;
5. execution is proven to occur only after a validated claim;
6. human release approval is recorded.

### Repository synchronization risk

A repository comparison on 2026-11-20 reported the implementation branch as 203 commits ahead and 2 commits behind `main`, with 84 changed files. This is a divergent branch, not a clean fast-forward. Do not merge or rebase automatically. First inspect the two main-only commits and determine whether their changes are already present or need a deliberate cherry-pick/reconciliation. Preserve the recorded main-branch incident history.

### Current completion estimate

A preliminary, milestone-weighted project estimate is approximately 65%. This is a planning estimate, not a measured test score or percentage of code written. The frontend/PWA and local deterministic AI foundations are substantially implemented; durable backend, authentication/tenant isolation, full worker lifecycle, PostgreSQL integration, production operations, and release verification remain incomplete. Recalculate after evidence-backed milestone acceptance; do not raise the estimate for documentation or code volume alone.


### Latest branch audit evidence — 2026-11-20

- Latest lifecycle-plan commit: `2285ae6d22bc398e9b0e4d00de55ed0aeae5ee79`.
- The Phase 6G.12 plan was fetched back from the feature branch and verified at blob `88a943f6e886e0506bb18c5a038a49b65c60406a`.
- GitHub combined status returned six Vercel project contexts in `failure`, each linking to the Vercel `build-rate-limit` upgrade page. This is a build quota/platform constraint, not a test assertion or source-code diagnosis.
- No PR-triggered GitHub Actions workflow run was returned for this commit. Therefore no new test/build pass is claimed.
- The branch remains divergent from `main` (203 ahead, 2 behind in the observed comparison). No merge/rebase was performed.
- Phase 6G.12 remains PLAN ONLY. Lease renewal, settlement, cancellation, PostgreSQL driver, and executor integration are not implemented by this commit.


### Follow-up test-model correction — 2026-11-20

- The deterministic fake previously keyed issue/claim idempotency by principal and key only. This did not match the Phase 6G.12 contract requiring principal + task + operation scoping.
- Updated the fake to scope issuance keys as principal/task/issue/key and claim keys as principal/task/claim/key.
- Added a regression test proving the same idempotency key can be used independently for two different tasks under the same principal.
- Commits: `480f124c4d3dce5d5d58090a5a243fb520db031a` and `6de7321ef8de7d9b1d24a17bdc5fc023dd7d4c2a`.
- Source and test files were fetched back from the feature branch and verified. Tests have NOT been executed; the new test is not marked passing.
- Latest observed branch comparison: 207 commits ahead, 2 behind `main`, status `diverged`. No merge or rebase was performed.
- Latest combined statuses are Vercel `build-rate-limit` failures across six project contexts. These are platform quota signals, not passing/failing test assertions. No PR-triggered workflow run was returned.


### Deterministic approval-token recovery and CI evidence — 2026-11-20

- Identified and corrected an idempotency contract gap: random token generation could not reproduce the original raw approval token after a lost response, even when the durable store correctly recognized the same idempotency request.
- Added `createHmacApprovalTokenFactory` using Node's built-in HMAC-SHA-256. Token derivation is domain-separated and bound to trusted principal subject, task ID, canonical payload hash, and idempotency key. The server-only secret must be at least 32 bytes. The service now requires an explicitly injected token factory; it no longer silently defaults to a non-replayable random token generator.
- The service accepts an already-approved snapshot only to attempt the same idempotent grant request. The store must return the original approved snapshot and expiry for an exact replay; a different request with the same key returns conflict. Raw tokens remain absent from persistence requests; only their SHA-256 digest is persisted.
- Updated the deterministic fake to retain replay metadata, and added regression tests for same-request token replay, different-digest conflict, and HMAC scope separation.
- The token factory helper and tests are source-level implementation only. No production secret is configured or verified, and no production service composition or durable PostgreSQL driver has been connected.
- CI initially caught two implementation issues (comment syntax and an outdated wrong-state assertion). Both were corrected before the final passing run.
- Frontend CI for commit `d62c1036b308316fad667bd7a57b304cae62eaf4` completed successfully: 136 tests passed, 0 failed; typecheck, browser/server boundary check, and production build passed; `npm audit` reported 0 vulnerabilities. Workflow run: https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44569821768
- Browser/Playwright/WCAG workflow run `44569821776` had not completed at the time of this record; no browser pass is claimed.
- Latest observed branch comparison after the documentation update: 221 commits ahead, 2 behind `main`, status `diverged`. No merge or rebase was performed. The two main-only commits add and then revert a test file; no production source change was observed in those two commits.
- Vercel combined status still reports six project contexts failing with `build-rate-limit`; the separate Vercel deployment integration context reports success. No Vercel build log or new deployment artifact was verified, so this is not classified as a source-code failure or a verified release.
- Repository reuse remains constrained by the existing audit: no external AI repository code was copied. Private access alone does not establish a license or cross-repository reuse authorization.
- Executor remains disabled. Lease renewal, settlement, cancellation, PostgreSQL transaction semantics, production identity/tenant isolation, and release readiness remain incomplete.


### Approval-token payload-binding regression — 2026-11-20

- Added a focused HMAC regression assertion proving that changing the canonical payload hash changes the derived approval token, alongside the existing principal/task/idempotency-key scope assertions.
- Commit: `97bf6a7aeaad52f685a4239064c24f17185f0d08`.
- The test file was fetched back from the feature branch and the new assertion was verified in the returned content.
- This is source-level test coverage only. No workflow run was yet associated with this exact commit at the time of the check; do not mark the new assertion as CI-passing.
- Branch comparison: 223 commits ahead, 2 behind `main`, status `diverged`, 84 changed files. No merge or rebase was performed.
- No production secret, durable PostgreSQL driver, lease lifecycle implementation, migration, deployment, or executor activation was performed.
