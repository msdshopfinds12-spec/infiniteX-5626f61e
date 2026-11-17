# Phase 3D-4F — Database Security, RLS and Audit Design

Status: **SCHEMA DISCOVERY COMPLETE FOR THE CHECKED BRANCH; NO DATABASE SCHEMA OR MIGRATION FOUND; DESIGN ONLY**

## 1. Evidence-based repository inventory

Read-only inspection of the recursive Git tree at branch head `c84f97c1c1e47f9018a7a147661a893e5c23a854` found:

- API source and tests under `apps/api/`.
- PostgreSQL adapter source for `auth_sessions` and `workspace_memberships`.
- No `supabase/` directory.
- No `migrations/`, `schema/`, `database/`, or `db/` directory.
- No tracked `.sql` files in the inspected branch tree.
- No verified database schema, database connection, RLS policy, or migration history in this repository snapshot.

This is a repository-tree finding only. It does **not** prove that no database exists outside this repository. The Supabase/PostgreSQL project and its live schema were not queried.

## 2. Security decision

Do not create or apply production migrations from adapter assumptions. First obtain a read-only schema export or inspect the intended database through an authorized, read-only connection. Reconcile identity, workspace, membership, and session entities before generating SQL.

The existing PostgreSQL adapters are contracts, not proof of a provisioned schema or working database integration.

## 3. Target tenant-isolation model

### Trust boundaries

1. The browser submits an opaque session cookie and a requested workspace identifier.
2. The API validates the session against the persistent session repository.
3. The API derives the user identity exclusively from the resolved session.
4. The API loads active membership for that identity and the requested workspace.
5. The authorization policy checks the requested operation against the database-derived role.
6. The API opens a database transaction and sets transaction-local identity context only after successful authentication and authorization.
7. PostgreSQL RLS provides defense in depth; application authorization remains mandatory.

Never accept `user_id`, `role`, `is_owner`, or a trusted tenant identity from browser JSON as authoritative. A client-supplied workspace ID is a resource selector only; it must be checked against active membership.

### Database connection assumptions

- Browser clients must not receive the privileged backend database connection string.
- Use a dedicated runtime role with only required table privileges.
- The runtime role must not be superuser, table owner, or have `BYPASSRLS`.
- Use a separate migration/owner role that is never available to the running API.
- Enable RLS on every tenant-owned table and use `FORCE ROW LEVEL SECURITY` where compatible with the operational role model.
- Set identity with transaction-local configuration (for example, `set_config(..., true)`) inside every transaction; never use connection-persistent session state with a pooled connection.
- Do not treat a custom PostgreSQL setting as cryptographic proof. It is trustworthy only when untrusted clients cannot connect directly using the runtime database role and only the trusted API can issue queries with that role.
- Always parameterize values. Never concatenate tenant IDs, user IDs, or client values into SQL.

## 4. RLS policy design requirements

Actual SQL must wait until the real table and column names are confirmed.

For every tenant-owned table:

- SELECT: allow only rows whose workspace has an active membership for the authenticated user.
- INSERT: require the new row's workspace to match the transaction's authorized workspace and the actor to hold the required create permission.
- UPDATE: require both old-row visibility and new-row workspace/ownership validity; prohibit changing a row's tenant key unless a separately authorized transfer operation exists.
- DELETE: require explicit permission and the correct tenant scope.
- Cross-tenant requests must return no row or a denied operation; never fall back to a global query.
- Administrative access must be an explicit server-side policy, not a magic client role or a bypass flag.
- Membership/role administration must use a separate transaction-safe workflow with last-owner protection.
- Add indexes for the actual RLS predicates after checking query plans; do not add speculative indexes.

Avoid recursive membership RLS. A membership-check helper, if needed, must be narrowly scoped, owned by a non-login schema owner, use a fixed safe `search_path`, avoid dynamic SQL, and have EXECUTE revoked from PUBLIC before granting only the required runtime role. Review the helper for privilege escalation before deployment.

## 5. Audit-event architecture

Audit events for security-sensitive operations should be written in the same database transaction as the mutation. If the audit insert fails, the mutation must roll back.

Minimum event contract:

| Field | Requirement |
|---|---|
| event_id | Server-generated UUID |
| occurred_at | Database timestamp |
| actor_user_id | Resolved session identity |
| workspace_id | Authorized tenant scope |
| action | Allowlisted event name |
| target_type / target_id | Resource reference, not full resource content |
| outcome | success or denied |
| request_id | Server-generated or validated correlation ID |
| metadata | Small allowlisted JSON object; no secrets or raw request body |

Never record raw session tokens, CSRF tokens, passwords, API keys, provider credentials, full authorization headers, or sensitive user payloads.

Recommended privileges:

- Runtime API role: INSERT audit events; SELECT only if an explicit audit-read permission is required.
- Runtime API role: no UPDATE or DELETE on audit events.
- Separate migration/maintenance role: schema changes under approval.
- Retention/export policy: defined before production use.
- Audit readers: workspace-scoped and least privilege.

Append-only permissions are a baseline, not a cryptographic immutability guarantee. Stronger tamper evidence (hash chaining, external immutable storage, or signed checkpoints) is a later control requiring operational key management and recovery design.

## 6. Migration and rollback gate

Before writing migration SQL:

1. Capture the real schema, extensions, constraints, indexes, grants, RLS state and existing policies.
2. Identify the canonical identity provider and user ID format.
3. Identify existing workspace and membership tables; do not create duplicates.
4. Confirm data volumes and orphan/duplicate records using read-only queries.
5. Design forward migration and explicit rollback/restore plan.
6. Test against a disposable PostgreSQL database with synthetic users and workspaces.
7. Verify cross-tenant SELECT, INSERT, UPDATE and DELETE denial.
8. Verify role changes, concurrent last-owner protection and audit atomicity.
9. Obtain human approval before any live migration.

Rollback must not silently weaken RLS or broaden privileges. If a schema rollback risks data loss, prefer a forward corrective migration and a tested backup restore procedure.

## 7. Required integration test matrix

- User A can access only Workspace A.
- User A cannot read or mutate Workspace B by changing request parameters.
- Inactive membership is denied.
- Unknown role and missing membership are denied.
- Viewer cannot create or mutate content.
- Member can mutate only owned resources where policy requires ownership.
- Admin cannot promote an admin or change an owner through the ordinary role endpoint.
- Last active owner cannot be demoted or removed.
- Concurrent role changes cannot leave a workspace without an owner.
- Failed audit insert rolls back the protected mutation.
- A pooled connection does not retain identity context after transaction completion.
- Runtime role cannot bypass RLS or modify/delete audit rows.

All tests must use synthetic data and a disposable database.

## 8. Free-first CI plan

- Keep existing Node API unit tests and frontend CI.
- Use GitHub-hosted runners and a disposable PostgreSQL service container only after the schema contract exists.
- Do not add production secrets to CI.
- Do not connect CI to the live Supabase project.
- Pin third-party GitHub Actions to reviewed immutable SHAs.
- Use read-only repository permissions unless a job demonstrably needs more.
- Fail closed when database integration tests are configured but the required test database is unavailable; do not silently mark integration coverage as passed.

## 9. Explicitly not implemented

- No SQL migration.
- No RLS policy or database function.
- No live schema query or Supabase connection.
- No audit table or persistence adapter.
- No database role or secret change.
- No route integration or production authentication.
- No production data access.
- No deployment, merge, or paid service.

## 10. Exit criteria for Phase 3D-4F

Phase 3D-4F can move from design to implementation only when the canonical schema is evidenced and reviewed. The next implementation phase should build migration files, RLS policies, audit persistence and disposable-PostgreSQL integration tests from that verified schema—not from guessed table names.
