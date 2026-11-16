import { authorizeWorkspaceRoleChange } from "../authorization/policy.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(value, field) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new TypeError(field + " must be a valid UUID");
  }
}

function assertRequestId(value) {
  if (typeof value !== "string" || value.trim().length < 1 || value.length > 128) {
    throw new TypeError("requestId must contain 1 to 128 characters");
  }
}

async function rollbackQuietly(client) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original failure; connection will be released.
  }
}

/**
 * PostgreSQL adapter for workspace membership changes.
 * All membership writers must lock the workspace row before mutating members.
 */
export function createWorkspaceMembershipRepository(pool) {
  if (!pool || typeof pool.connect !== "function") {
    throw new TypeError("A PostgreSQL-compatible pool is required");
  }

  return Object.freeze({
    async changeRole({ workspaceId, actorUserId, targetUserId, newRole, requestId }) {
      assertUuid(workspaceId, "workspaceId");
      assertUuid(actorUserId, "actorUserId");
      assertUuid(targetUserId, "targetUserId");
      assertRequestId(requestId);

      if (newRole !== null && !["owner", "admin", "member", "viewer"].includes(newRole)) {
        throw new TypeError("newRole is invalid");
      }

      const client = await pool.connect();
      let transactionOpen = false;

      try {
        await client.query("BEGIN");
        transactionOpen = true;

        // Transaction-local identity context is required by PostgreSQL RLS.
        // Values are parameterized and disappear automatically at transaction end.
        await client.query(
          "SELECT set_config('app.current_workspace_id', $1, true), " +
          "set_config('app.current_user_id', $2, true)",
          [workspaceId, actorUserId],
        );

        // Serializes membership mutations within this workspace.
        const workspace = await client.query(
          "SELECT id FROM workspaces WHERE id = $1 FOR UPDATE",
          [workspaceId],
        );

        if (workspace.rowCount !== 1) {
          await client.query("ROLLBACK");
          transactionOpen = false;
          return Object.freeze({ allowed: false, reason: "WORKSPACE_NOT_FOUND" });
        }

        const membershipRows = await client.query(
          "SELECT m.user_id, m.workspace_id, m.role, m.status, u.status AS account_status " +
          "FROM workspace_memberships AS m " +
          "INNER JOIN app_users AS u ON u.id = m.user_id " +
          "WHERE m.workspace_id = $1 AND m.user_id = ANY($2::uuid[]) " +
          "ORDER BY m.user_id FOR UPDATE OF m, u",
          [workspaceId, [actorUserId, targetUserId]],
        );

        const byUser = new Map(membershipRows.rows.map((row) => [
          row.user_id,
          {
            ...row,
            userId: row.user_id,
            workspaceId: row.workspace_id,
          },
        ]));
        const actor = byUser.get(actorUserId);
        const target = byUser.get(targetUserId);

        if (!actor || actor.status !== "active") {
          await client.query("ROLLBACK");
          transactionOpen = false;
          return Object.freeze({ allowed: false, reason: "ACTOR_NOT_ACTIVE" });
        }

        if (actor.account_status !== "active") {
          await client.query("ROLLBACK");
          transactionOpen = false;
          return Object.freeze({ allowed: false, reason: "ACTOR_ACCOUNT_DISABLED" });
        }

        if (!target || target.status !== "active") {
          await client.query("ROLLBACK");
          transactionOpen = false;
          return Object.freeze({ allowed: false, reason: "TARGET_NOT_ACTIVE" });
        }

        if (target.account_status !== "active") {
          await client.query("ROLLBACK");
          transactionOpen = false;
          return Object.freeze({ allowed: false, reason: "TARGET_ACCOUNT_DISABLED" });
        }

        const owners = await client.query(
          "SELECT count(*)::int AS active_owner_count " +
          "FROM workspace_memberships " +
          "WHERE workspace_id = $1 AND role = 'owner' AND status = 'active'",
          [workspaceId],
        );

        const decision = authorizeWorkspaceRoleChange({
          actorMembership: actor,
          targetMembership: target,
          newRole,
          activeOwnerCount: owners.rows[0]?.active_owner_count,
        });

        if (!decision.allowed) {
          await client.query("ROLLBACK");
          transactionOpen = false;
          return decision;
        }

        const updated = await client.query(
          "UPDATE workspace_memberships " +
          "SET role = COALESCE($3, role), " +
          "status = CASE WHEN $3::text IS NULL THEN 'revoked' ELSE status END, " +
          "updated_at = now() " +
          "WHERE workspace_id = $1 AND user_id = $2 AND status = 'active' " +
          "RETURNING user_id, workspace_id, role, status, updated_at",
          [workspaceId, targetUserId, newRole],
        );

        if (updated.rowCount !== 1) {
          throw new Error("Membership changed concurrently; retry the operation");
        }

        await client.query(
          "INSERT INTO audit_events " +
          "(actor_user_id, workspace_id, target_user_id, event_type, request_id, metadata) " +
          "VALUES ($1, $2, $3, $4, $5, $6::jsonb)",
          [
            actorUserId,
            workspaceId,
            targetUserId,
            newRole === null ? "workspace.member.revoked" : "workspace.member.role_changed",
            requestId,
            JSON.stringify({
              previousRole: target.role,
              newRole,
              previousStatus: target.status,
              newStatus: updated.rows[0].status,
            }),
          ],
        );

        await client.query("COMMIT");
        transactionOpen = false;

        return Object.freeze({
          allowed: true,
          membership: Object.freeze(updated.rows[0]),
          policyVersion: decision.policyVersion,
        });
      } catch (error) {
        if (transactionOpen) await rollbackQuietly(client);
        throw error;
      } finally {
        client.release();
      }
    },
  });
}
