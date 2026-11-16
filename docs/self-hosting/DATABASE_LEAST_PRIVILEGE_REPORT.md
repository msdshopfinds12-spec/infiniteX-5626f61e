# Database Least-Privilege Runtime Role — Phase Report

Date: 2026-11-17
Branch: feat/provider-neutral-billing-sandbox
Status: IMPLEMENTED; disposable PostgreSQL 17 CI verification PASS.

## Objective
Separate the PostgreSQL application runtime identity from the database administrator/migration identity. Validate the repository through the restricted runtime login and prove that unneeded privileges are denied.

## CI-only role definition
File: `infra/db/ci/0002_runtime_role.sql`

The script is explicitly for the disposable GitHub Actions database only. It creates/normalizes `infinite_x_app_runtime_ci` with:
- LOGIN, but no SUPERUSER;
- no CREATEDB, CREATEROLE, REPLICATION, or BYPASSRLS;
- no schema CREATE privilege;
- CONNECT to the disposable `infinite_x_ci` database and USAGE on schema public.

Granted table privileges:
- SELECT on `app_users`, `workspaces`, and `workspace_memberships`;
- UPDATE only on `updated_at` in `app_users` and `workspaces` (required by the repository's `SELECT ... FOR UPDATE` row locks);
- UPDATE only on `role`, `status`, and `updated_at` in `workspace_memberships`;
- INSERT only on the explicit audit event columns in `audit_events`.

The runtime role has no audit-event SELECT/UPDATE/DELETE, no app-user INSERT/UPDATE(status), no workspace UPDATE(name), no membership DELETE, and no table/schema creation.

## Integration test design
File: `apps/api/test/membership-repository.integration.test.mjs`

- `ADMIN_DATABASE_URL` is used only for synthetic fixture setup, inspection, trigger setup, and cleanup.
- `DATABASE_URL` connects the repository through the restricted `infinite_x_app_runtime_ci` login.
- Runtime role identity and role flags are asserted.
- Negative privilege probes must return PostgreSQL SQLSTATE `42501`.
- The repository's normal role-change, last-owner, concurrency, audit rollback, and disabled-account tests run through the restricted login.
- CI uses a fixed synthetic password only inside its ephemeral PostgreSQL service; it is not a production credential.

## CI evidence
- GitHub Actions Run #27: https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/43957624810
- Tested commit: `7260c0e151ab1a658f3764af6739acc25d6ca00c`
- Overall conclusion: success.
- Node test runner: 38 passed, 0 failed, 0 skipped.
- Runtime-role identity/privilege-denial test: passed.
- Five real PostgreSQL repository integration cases: passed.
- Migration, runtime-role setup, schema constraints, and CI cleanup: passed.
- PostgreSQL logs show expected permission-denied responses for forbidden app-user, workspace, membership, audit, and DDL operations.

## Security limitations and next controls
- This is table/column-level least privilege, not row-level tenant isolation. RLS policies are not yet implemented or tested.
- The runtime role can SELECT all rows from the three granted tables; protected API routes must enforce workspace membership and tenant-scoped query predicates until RLS is designed and verified.
- The narrow `updated_at` UPDATE grants on users/workspaces exist solely because the current repository locks those rows with `FOR UPDATE`. A future lock-function/advisory-lock design may remove these timestamp write grants, but must preserve account-disable and workspace mutation serialization.
- The CI role-creation SQL is not a production role-provisioning migration. Production role names, credentials, secret rotation, connection limits, network policy, ownership, and grants require a separate reviewed deployment plan.
- The repository has no committed `package-lock.json`; exact direct dependency pinning does not lock all transitive dependencies. Reproducible lockfile work remains outstanding.
- No production database was accessed or migrated. No merge, deployment, public release, or persistent data change was performed.
