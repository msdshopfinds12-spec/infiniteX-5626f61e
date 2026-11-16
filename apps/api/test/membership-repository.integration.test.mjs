import test, { before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { createWorkspaceMembershipRepository } from "../src/workspaces/membership-repository.mjs";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl, max: 8 }) : null;
const fixtures = [];
const integration = { skip: !databaseUrl };

async function createFixture({ actorRole = "owner", targetRole = "member", extraOwner = false } = {}) {
  const actorId = randomUUID();
  const targetId = randomUUID();
  const workspaceId = randomUUID();
  const extraOwnerId = extraOwner ? randomUUID() : null;

  await pool.query(
    "INSERT INTO app_users (id, status) VALUES ($1, 'active'), ($2, 'active')" +
      (extraOwner ? ", ($3, 'active')" : ""),
    extraOwner ? [actorId, targetId, extraOwnerId] : [actorId, targetId],
  );
  await pool.query(
    "INSERT INTO workspaces (id, name, created_by) VALUES ($1, $2, $3)",
    [workspaceId, "CI integration " + workspaceId, actorId],
  );
  await pool.query(
    "INSERT INTO workspace_memberships (workspace_id, user_id, role, granted_by) VALUES " +
      "($1, $2, $3, $2), ($1, $4, $5, $2)" +
      (extraOwner ? ", ($1, $6, 'owner', $2)" : ""),
    extraOwner
      ? [workspaceId, actorId, actorRole, targetId, targetRole, extraOwnerId]
      : [workspaceId, actorId, actorRole, targetId, targetRole],
  );
  fixtures.push({ workspaceId, actorId, targetId, extraOwnerId });
  return { workspaceId, actorId, targetId, extraOwnerId };
}

before(async () => {
  if (!pool) return;
  await pool.query(`
    CREATE OR REPLACE FUNCTION public.ci_reject_selected_audit_event()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.request_id = 'ci-force-audit-failure' THEN
        RAISE EXCEPTION 'synthetic audit failure';
      END IF;
      RETURN NEW;
    END;
    $$;
  `);
  await pool.query("DROP TRIGGER IF EXISTS ci_reject_selected_audit_event ON audit_events");
  await pool.query(`
    CREATE TRIGGER ci_reject_selected_audit_event
    BEFORE INSERT ON audit_events
    FOR EACH ROW EXECUTE FUNCTION public.ci_reject_selected_audit_event()
  `);
});

afterEach(async () => {
  if (!pool) return;
  const fixture = fixtures.pop();
  if (!fixture) return;
  await pool.query("DELETE FROM audit_events WHERE workspace_id = $1", [fixture.workspaceId]);
  await pool.query("DELETE FROM workspace_memberships WHERE workspace_id = $1", [fixture.workspaceId]);
  await pool.query("DELETE FROM workspaces WHERE id = $1", [fixture.workspaceId]);
  await pool.query("DELETE FROM app_users WHERE id = ANY($1::uuid[])", [
    [fixture.actorId, fixture.targetId, fixture.extraOwnerId].filter(Boolean),
  ]);
});

after(async () => {
  if (!pool) return;
  await pool.query("DROP TRIGGER IF EXISTS ci_reject_selected_audit_event ON audit_events");
  await pool.query("DROP FUNCTION IF EXISTS public.ci_reject_selected_audit_event()");
  await pool.end();
});

test("real PostgreSQL: role mutation and audit event commit atomically", integration, async () => {
  const fixture = await createFixture();
  const result = await createWorkspaceMembershipRepository(pool).changeRole({
    ...fixture,
    actorUserId: fixture.actorId,
    targetUserId: fixture.targetId,
    newRole: "viewer",
    requestId: "ci-role-change-" + randomUUID(),
  });
  assert.equal(result.allowed, true);
  assert.equal(result.membership.role, "viewer");
  const audit = await pool.query(
    "SELECT event_type, metadata FROM audit_events WHERE workspace_id = $1 AND target_user_id = $2",
    [fixture.workspaceId, fixture.targetId],
  );
  assert.equal(audit.rowCount, 1);
  assert.equal(audit.rows[0].event_type, "workspace.member.role_changed");
  assert.equal(audit.rows[0].metadata.newRole, "viewer");
});

test("real PostgreSQL: the only active owner cannot revoke itself", integration, async () => {
  const fixture = await createFixture();
  const result = await createWorkspaceMembershipRepository(pool).changeRole({
    workspaceId: fixture.workspaceId,
    actorUserId: fixture.actorId,
    targetUserId: fixture.actorId,
    newRole: null,
    requestId: "ci-last-owner-" + randomUUID(),
  });
  assert.deepEqual(result, { allowed: false, reason: "LAST_OWNER_INVARIANT" });
  const membership = await pool.query(
    "SELECT role, status FROM workspace_memberships WHERE workspace_id = $1 AND user_id = $2",
    [fixture.workspaceId, fixture.actorId],
  );
  assert.deepEqual(membership.rows[0], { role: "owner", status: "active" });
});

test("real PostgreSQL: concurrent owner revocations preserve one active owner", integration, async () => {
  const fixture = await createFixture({ extraOwner: true, targetRole: "owner" });
  const repository = createWorkspaceMembershipRepository(pool);
  const results = await Promise.all([
    repository.changeRole({
      workspaceId: fixture.workspaceId,
      actorUserId: fixture.actorId,
      targetUserId: fixture.targetId,
      newRole: null,
      requestId: "ci-concurrent-a-" + randomUUID(),
    }),
    repository.changeRole({
      workspaceId: fixture.workspaceId,
      actorUserId: fixture.actorId,
      targetUserId: fixture.extraOwnerId,
      newRole: null,
      requestId: "ci-concurrent-b-" + randomUUID(),
    }),
  ]);
  assert.equal(results.filter((result) => result.allowed).length, 1);
  assert.equal(results.filter((result) => result.reason === "LAST_OWNER_INVARIANT").length, 1);
  const owners = await pool.query(
    "SELECT count(*)::int AS count FROM workspace_memberships " +
      "WHERE workspace_id = $1 AND role = 'owner' AND status = 'active'",
    [fixture.workspaceId],
  );
  assert.equal(owners.rows[0].count, 2);
});

test("real PostgreSQL: audit insert failure rolls back the membership mutation", integration, async () => {
  const fixture = await createFixture();
  await assert.rejects(
    createWorkspaceMembershipRepository(pool).changeRole({
      workspaceId: fixture.workspaceId,
      actorUserId: fixture.actorId,
      targetUserId: fixture.targetId,
      newRole: "viewer",
      requestId: "ci-force-audit-failure",
    }),
    /synthetic audit failure/,
  );
  const membership = await pool.query(
    "SELECT role, status FROM workspace_memberships WHERE workspace_id = $1 AND user_id = $2",
    [fixture.workspaceId, fixture.targetId],
  );
  assert.deepEqual(membership.rows[0], { role: "member", status: "active" });
  const audit = await pool.query(
    "SELECT count(*)::int AS count FROM audit_events WHERE workspace_id = $1",
    [fixture.workspaceId],
  );
  assert.equal(audit.rows[0].count, 0);
});

test("real PostgreSQL: disabled target accounts cannot be modified", integration, async () => {
  const fixture = await createFixture();
  await pool.query("UPDATE app_users SET status = 'disabled' WHERE id = $1", [fixture.targetId]);
  const result = await createWorkspaceMembershipRepository(pool).changeRole({
    workspaceId: fixture.workspaceId,
    actorUserId: fixture.actorId,
    targetUserId: fixture.targetId,
    newRole: "viewer",
    requestId: "ci-disabled-target-" + randomUUID(),
  });
  assert.deepEqual(result, { allowed: false, reason: "TARGET_ACCOUNT_DISABLED" });
});
