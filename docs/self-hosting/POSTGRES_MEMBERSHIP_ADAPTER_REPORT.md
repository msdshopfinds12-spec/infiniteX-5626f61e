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
- GitHub fetch-back: pending at report creation.
- GitHub Actions: pending after the latest commit.
- PostgreSQL integration: NOT TESTED.
- Migration applied: NO.
- Database started: NO.
- API route/authentication integration: NO.
- Merge/deployment: NO.

## Scope controls
No dependency installation, no DB startup, no migration execution, no secrets, no public ingress, no provider install, no live user data, no merge and no deployment.

## Next gate
Wait for CI. If it passes, review adapter code and then add a disposable PostgreSQL integration-test job with synthetic fixtures. Only after successful integration tests should a separate migration review and explicit approval be requested.