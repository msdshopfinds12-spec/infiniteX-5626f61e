# InfiniteX PostgreSQL Membership Adapter — Phase Report

Date: 2026-11-17
Branch: feat/provider-neutral-billing-sandbox
Phase: BUILD — repository and migration artifacts; database remains untouched.

## Deliverables
- infra/db/migrations/0001_identity_workspace_foundation.sql
- apps/api/src/workspaces/membership-repository.mjs
- apps/api/test/membership-repository.test.mjs
- apps/api/src/workspaces/README.md
- apps/api/package.json — syntax checks include the new adapter and test.
- .github/workflows/self-hosted-api.yml — database migration changes now trigger API checks.
- docs/self-hosting/DATABASE_SCHEMA_PROPOSAL.md — table naming aligned to app_users.

## Implemented adapter behavior
- Requires a pg-compatible pool to be injected; no driver or secret is configured.
- Validates UUID and request ID input before acquiring a connection.
- Uses positional SQL parameters for values.
- Starts a transaction and locks the workspace row before membership changes.
- Reads actor and target membership rows under row locks.
- Counts active owners while holding the workspace lock.
- Reuses the deny-by-default role policy.
- Updates or revokes membership and writes an allowlisted audit event in the same transaction.
- Rolls back on denied policy decisions and errors; always releases the client.

## Concurrency invariant
The workspace row lock serializes membership mutations only if every writer uses the same lock protocol. All future membership create/revoke/role-change paths, including admin and background paths, must lock the workspace row first. A PostgreSQL integration test with concurrent competing demotions is still required before claiming this invariant is verified against a real database.

## Verification status
- GitHub writes: committed.
- GitHub fetch-back: VERIFIED for migration, adapter, tests, docs, package and workflow.
- GitHub Actions: PASS — run #14; syntax checks passed; 29 tests passed / 0 failed.
- PostgreSQL integration: NOT TESTED.
- Migration applied: NO.
- Database started: NO.
- API route/authentication integration: NO.
- Merge/deployment: NO.

## CI evidence
- Run: https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/43955664713
- Commit tested: 62704c8c5a7a46bf4fa774270277061d597a3e87
- Workflow completed successfully; Node test runner reported 29 passed and 0 failed.
- Earlier runs exposed a database-row naming mismatch (`user_id`/`workspace_id` versus policy contract fields). The adapter now maps trusted database rows into the policy contract; the corrected run passed.
- These are unit tests using a pg-compatible test double, not a real PostgreSQL integration test.

## Scope controls
No dependency installation, no DB startup, no migration execution, no secrets, no public ingress, no provider install, no live user data, no merge and no deployment.

## Next gate
Wait for CI. If it passes, review adapter code and then add a disposable PostgreSQL integration-test job with synthetic fixtures. Only after successful integration tests should a separate migration review and explicit approval be requested.