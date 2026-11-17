import { authorizeWorkspaceRoleChange } from "../authorization/policy.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_ROLES = new Set(["owner", "admin", "member", "viewer"]);

function assertUuid(value, name) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new TypeError(name + " must be a valid UUID");
  }
}

export function createPostgresMembershipRepository({ pool }) {
  if (!pool || typeof pool.connect !== "function") {
    throw new TypeError("A PostgreSQL pool with connect() is required");
  }

  return Object.freeze({
    async findActiveMembership({ userId, workspaceId }) {
      assertUuid(userId, "userId");
      assertUuid(workspaceId, "workspaceId");
      const result = await pool.query(
        `SELECT user_id::text AS "userId",
                workspace_id::text AS "workspaceId",
                role, status
           FROM workspace_memberships
          WHERE user_id = $1::uuid
            AND workspace_id = $2::uuid
            AND status = 'active'
          LIMIT 1`,
        [userId, workspaceId]
      );
      return result.rows?.[0] ?? null;
    },

    async changeRole({ actorUserId, targetUserId, workspaceId, newRole }) {
      assertUuid(actorUserId, "actorUserId");
      assertUuid(targetUserId, "targetUserId");
      assertUuid(workspaceId, "workspaceId");
      if (!VALID_ROLES.has(newRole)) {
        return Object.freeze({ allowed: false, reason: "INVALID_TARGET_ROLE" });
      }
      if (actorUserId === targetUserId) {
        return Object.freeze({ allowed: false, reason: "SELF_ROLE_CHANGE_DENIED" });
      }

      const client = await pool.connect();
      let transactionOpen = false;
      try {
        await client.query("BEGIN");
        transactionOpen = true;

        // Lock every active membership in this workspace so concurrent role
        // changes cannot both observe a stale last-owner count.
        const locked = await client.query(
          `SELECT user_id::text AS "userId",
                  workspace_id::text AS "workspaceId",
                  role, status
             FROM workspace_memberships
            WHERE workspace_id = $1::uuid
              AND status = 'active'
            ORDER BY user_id
            FOR UPDATE`,
          [workspaceId]
        );
        const memberships = locked.rows ?? [];
        const actor = memberships.find((row) => row.userId === actorUserId);
        const target = memberships.find((row) => row.userId === targetUserId);
        if (!actor || !target) {
          await client.query("ROLLBACK");
          transactionOpen = false;
          return Object.freeze({ allowed: false, reason: "MEMBERSHIP_NOT_FOUND" });
        }

        const activeOwnerCount = memberships.filter(
          (row) => row.role === "owner" && row.status === "active"
        ).length;
        const decision = authorizeWorkspaceRoleChange({
          actorMembership: actor,
          targetMembership: target,
          newRole,
          activeOwnerCount
        });
        if (!decision.allowed) {
          await client.query("ROLLBACK");
          transactionOpen = false;
          return decision;
        }

        const updated = await client.query(
          `UPDATE workspace_memberships
              SET role = $3, updated_at = NOW()
            WHERE workspace_id = $1::uuid
              AND user_id = $2::uuid
              AND status = 'active'
          RETURNING user_id::text AS "userId",
                    workspace_id::text AS "workspaceId",
                    role, status`,
          [workspaceId, targetUserId, newRole]
        );
        if (updated.rowCount !== 1 || !updated.rows?.[0]) {
          throw new Error("Membership role update did not affect exactly one active row");
        }

        await client.query("COMMIT");
        transactionOpen = false;
        return Object.freeze({ allowed: true, membership: Object.freeze(updated.rows[0]) });
      } catch (error) {
        if (transactionOpen) {
          try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
        }
        throw error;
      } finally {
        client.release();
      }
    }
  });
}
