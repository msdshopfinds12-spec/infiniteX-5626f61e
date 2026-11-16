# PostgreSQL 17 Disposable CI Integration — Phase Report

Date: 2026-11-17
Branch: feat/provider-neutral-billing-sandbox
Status: IMPLEMENTED; PostgreSQL 17 integration workflow PASS.

## Scope
Run the existing identity/workspace migration against an ephemeral PostgreSQL 17 service in GitHub Actions. Use synthetic fixtures, assert schema constraints, and roll back test fixtures. The CI database is isolated to the workflow run.

## Changes
- infra/db/tests/0001_identity_workspace.integration.sql
  - Inserts synthetic users, identity link, workspace, memberships and audit event.
  - Verifies fixture relationships and JSONB metadata.
  - Verifies duplicate issuer+subject is rejected.
  - Verifies unknown roles are rejected by CHECK constraints.
  - Verifies unknown user references are rejected by foreign keys.
  - Verifies audit metadata must be a JSON object.
  - Rolls back all fixtures.
- .github/workflows/self-hosted-api.yml
  - Adds PostgreSQL 17 service container with a CI-only password.
  - Installs the PostgreSQL client on the ephemeral GitHub runner.
  - Applies migration 0001 to the disposable CI database.
  - Executes schema integration assertions.
  - Adds infra/db/** to pull-request path filters.

## Safety boundaries
- No repository production database connection.
- No production secrets or external database credentials.
- No persistent volume or public deployment.
- No migration executed outside the ephemeral CI service.
- No merge or deployment.

## CI evidence
- Run: https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/43956081993
- Run #16 completed successfully.
- PostgreSQL 17 service initialized and passed its health check.
- Migration application passed.
- Synthetic relational and constraint assertions passed.
- Existing Node syntax checks and 29 unit tests passed in the same job.

## Verification limits
This validates the migration and relational constraints against real PostgreSQL. It does NOT yet execute the Node membership repository against PostgreSQL, verify concurrent membership operations, or establish database least-privilege grants. Those remain separate phases.


## Security hardening follow-up — account status enforcement
The membership repository now joins workspace_memberships to app_users and locks both membership and user rows before evaluating a role change. Both actor and target accounts must have status='active'. Disabled actor and target accounts are denied before mutation. Request IDs containing only whitespace are rejected before acquiring a database connection.

Regression coverage added:
- disabled actor account is denied and transaction rolled back;
- disabled target account is denied and transaction rolled back;
- whitespace-only request ID rejected before connecting.

## Latest CI evidence
- Run #18: https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/43956414805
- Tested commit: 1b0457a5a281d001b5ac9a1fabedb5806ad7c309
- Overall conclusion: success.
- Node tests: 32 passed, 0 failed.
- PostgreSQL 17 service health check: passed.
- Migration application: passed.
- Synthetic schema and constraint assertions: passed.
- Runner and service-container cleanup: passed.

## Remaining limitations
- The Node repository adapter still has not been exercised through a real pg driver against PostgreSQL; the repository unit tests use a test double.
- Concurrent role-change behavior and last-owner serialization still need real multi-connection integration tests.
- Database least-privilege roles/grants, OIDC validation, protected HTTP endpoints, and production readiness remain unimplemented or unverified.


## PostgreSQL-backed Node repository integration — verified
The Node.js membership repository is now exercised through the real `pg` driver against the disposable PostgreSQL 17 service in GitHub Actions.

Implementation:
- Added exact direct dependency `pg@8.16.3` to `apps/api/package.json`.
- Added `apps/api/test/membership-repository.integration.test.mjs`.
- CI installs the declared dependency, applies migration 0001 to its ephemeral PostgreSQL 17 service, then runs unit, HTTP, and repository integration tests with a CI-only `DATABASE_URL`.
- Synthetic users, workspaces, memberships, and audit rows are generated per test and cleaned up.
- A temporary CI-only trigger deliberately fails one audit insert to verify transaction rollback; trigger/function are removed after the suite.

Verified real-PostgreSQL cases:
1. Role update and audit event commit atomically.
2. The only active owner cannot revoke itself.
3. Concurrent owner self-demotion and another owner revocation cannot leave the workspace without an active owner.
4. Audit insertion failure rolls back the membership update.
5. Disabled target accounts are denied.

CI evidence:
- Run #22: https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/43957068074
- Tested commit: `06f0c255f31ce704302028789d678430cb90fcb8`
- Overall conclusion: success.
- Node test runner: 37 passed, 0 failed, 0 skipped.
- Real PostgreSQL repository integration cases: 5 passed.
- PostgreSQL 17 migration, schema assertions, and cleanup: passed.

Reproducibility caveat:
- The direct `pg` version is exact-pinned, but this branch does not yet contain a committed npm lockfile. CI currently installs with `--package-lock=false`, so transitive dependency resolution is not fully locked across separate runs. Add and review a committed lockfile before release.

Remaining limitations:
- No production database has been connected or migrated.
- No production OIDC provider, authentication routes, or HTTP authorization middleware are wired.
- The integration tests cover workspace membership mutations, not every tenant-scoped business-data query.
- Database least-privilege roles/grants and broader backup/restore operations remain outstanding.
- No merge or deployment was performed.


## Least-privilege PostgreSQL runtime role — verified
- Added CI-only role bootstrap: `infra/db/ci/0002_runtime_role.sql`.
- Repository integration tests now use a restricted runtime login through `DATABASE_URL`; a separate administrator connection is limited to fixture setup, assertions, trigger setup, and cleanup.
- Runtime identity has no superuser, database creation, role creation, replication, BYPASSRLS, schema CREATE, or audit read/update/delete privileges.
- Table/column grants are restricted to authorization reads, membership role/status changes, and audit inserts. Timestamp-only UPDATE on app_users/workspaces is retained for current SELECT FOR UPDATE locking.
- Forbidden SQL operations are tested and expected to return SQLSTATE 42501.
- GitHub Actions Run #27: https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/43957624810
- Tested commit: `7260c0e151ab1a658f3764af6739acc25d6ca00c`
- Node tests: 38 passed, 0 failed, 0 skipped; five PostgreSQL repository integration cases passed.
- Detailed report: `docs/self-hosting/DATABASE_LEAST_PRIVILEGE_REPORT.md`.

Important: these grants do not implement row-level tenant isolation. RLS and tenant-scoped business-data query verification remain separate work. No production DB, merge, or deployment was involved.
