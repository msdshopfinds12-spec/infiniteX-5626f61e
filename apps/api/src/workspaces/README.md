# PostgreSQL Membership Adapter — Implementation Notes

**Status:** Code and SQL artifacts added on feature branch. Migration NOT applied.
**Scope:** Workspace membership role changes only. No login or HTTP route is wired.

## Files
- infra/db/migrations/0001_identity_workspace_foundation.sql
- apps/api/src/workspaces/membership-repository.mjs
- apps/api/test/membership-repository.test.mjs

## Transaction protocol
1. Validate identifiers and role input before acquiring a connection.
2. Begin transaction.
3. Lock the workspace row with SELECT FOR UPDATE.
4. Read actor and target memberships under row locks.
5. Count active owners while holding the workspace lock.
6. Run the existing deny-by-default policy.
7. Update/revoke the target membership.
8. Insert an allowlisted audit event in the same transaction.
9. Commit; on denial or error, rollback and release the connection.

All membership mutation code paths must lock the same workspace row first. This serializes competing membership changes within one workspace and protects the last-owner invariant. Future bulk/admin/background paths must follow the same protocol.

## Trust boundary
The repository receives actor identity from a future trusted API authentication layer. Never pass actorUserId, actor role or workspace membership directly from browser/mobile request data. The repository re-reads membership from PostgreSQL; the policy result is not a substitute for authentication.

## SQL safety
All data values use PostgreSQL positional parameters. Table and column identifiers are fixed source literals. No dynamic SQL identifiers are accepted.

## Important remaining work
- Add a production PostgreSQL pool factory after the driver and secret-management plan are approved.
- Add integration tests against a disposable PostgreSQL instance, including concurrent owner-demotion attempts.
- Add least-privilege database roles and grants.
- Add a reviewed migration runner and checksum/history table.
- Add workspace-scoped repository methods for every business resource.
- Decide and test row-level security separately; application-level predicates must remain even if RLS is later enabled.
- Add API route only after trusted authentication/session resolution exists.

## Explicitly not done
No package installation, database startup, migration execution, seed data, public port, secrets, OIDC provider, login, route integration, merge or deployment.
