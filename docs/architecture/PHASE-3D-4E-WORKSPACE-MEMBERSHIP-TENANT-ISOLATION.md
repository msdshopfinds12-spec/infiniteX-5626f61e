# Phase 3D-4E — Workspace Membership and Tenant Isolation Foundation

Status: **POLICY HARDENING + TRANSACTIONAL ADAPTER SOURCE COMMITTED; DATABASE NOT PROVISIONED**

## Scope delivered

- Reject null and unknown workspace roles in `authorizeWorkspaceRoleChange`.
- Add `postgres-membership-repository.mjs` with an injected PostgreSQL pool.
- Scope membership lookup by both user and workspace and require active status.
- Lock all active memberships in a workspace in deterministic user order before evaluating a role change.
- Evaluate actor, target, role and active-owner count from database rows—not request-supplied membership claims.
- Apply the role update only after policy authorization.
- Require exactly one active target row to be updated.
- Commit only on success; rollback on denial or error; always release the checked-out client.
- Normalize UUID inputs before database comparisons.
- Reject self-role changes and explicit owner assignment through this ordinary role-change method.

## Transaction design

The role-change transaction is:

1. `BEGIN`
2. `SELECT ... WHERE workspace_id = $1 AND status = 'active' ORDER BY user_id FOR UPDATE`
3. Resolve actor and target from the locked database result.
4. Count active owners from the locked result.
5. Run deny-by-default authorization policy.
6. `UPDATE ... WHERE workspace_id = $1 AND user_id = $2 AND status = 'active' RETURNING ...`
7. Require exactly one returned row.
8. `COMMIT`; otherwise `ROLLBACK`.

Deterministic row locking serializes competing role-change transactions over the same currently-active workspace membership set and prevents stale owner-count reads between those transactions. This does not replace database constraints, a canonical workspace lock strategy for membership creation/deactivation, or a reviewed ownership-transfer workflow.

## Expected schema contract (not migrated)

The adapter assumes `workspace_memberships` has:

| Column | Expected type/semantics |
|---|---|
| `workspace_id` | UUID, non-null |
| `user_id` | UUID, non-null |
| `role` | constrained to owner/admin/member/viewer |
| `status` | active/inactive lifecycle value |
| `updated_at` | timestamptz |

Recommended separately reviewed database controls:

- Unique constraint on (`workspace_id`, `user_id`).
- Foreign keys to canonical workspaces and identities.
- Check constraint for the supported role set and membership status set.
- Index supporting (`workspace_id`, `status`, `user_id`).
- Runtime role has only necessary SELECT/UPDATE privileges; no DDL, ownership, superuser, or BYPASSRLS.
- RLS policy must derive access from trusted database identity context and must not trust arbitrary client workspace IDs.
- Role changes must be auditable with actor, target, workspace, old/new role and timestamp.

## Authorization policy fix

The previous policy accepted `newRole: null` in a subset of role-change requests. It now requires one of the explicit supported role strings. Explicit assignment to `owner` is denied by this ordinary method and must use a separately designed ownership-transfer operation with re-authentication, atomic transfer semantics, audit and rollback tests.

## Test coverage added

- Active membership lookup scope.
- Transaction begin, row lock, authorized update and commit.
- Last-owner policy denial.
- Null/invalid role denial.
- Self-role-change denial before opening a transaction.
- Uppercase UUID normalization before locked-row matching.
- Admin scope denial when attempting to change an owner role, with transaction rollback.
- Rollback and client release when update row count is unexpected.
- Missing pool capability rejection.

Test source is committed. **Actual Node test execution and GitHub Actions result remain unverified** until a workflow run is observed.

## Explicit limitations

- No migration or live schema inspection was performed.
- No database pool or credentials are configured.
- No HTTP route calls this repository yet.
- No membership creation/deactivation, invitation acceptance, explicit ownership transfer, RLS, audit persistence, or account suspension flow is implemented.
- This is not proof of complete tenant isolation or production authorization readiness.

## Next gates

1. Read-only inspect the actual Supabase/PostgreSQL schema and RLS policies.
2. Reconcile the real identity/workspace table names and column types with these adapters.
3. Produce a migration proposal and rollback plan; do not apply it yet.
4. Add disposable PostgreSQL integration tests for transaction locking, constraints, and RLS using synthetic identities.
5. Add audit events in the same transaction as membership changes.
6. Wire route middleware only after the database contract and CI evidence are approved.
7. Keep AI agents disabled from workspace mutation until authorization and audit are proven end-to-end.
