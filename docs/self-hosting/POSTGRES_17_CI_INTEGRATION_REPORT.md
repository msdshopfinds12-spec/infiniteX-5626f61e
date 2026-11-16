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
