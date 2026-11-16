import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceMembershipRepository } from "../src/workspaces/membership-repository.mjs";

const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actorId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const targetId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const requestId = "test-request-001";
const fakeSigner = Object.freeze({
  sign({ userId, workspaceId: signedWorkspaceId, transactionId }) {
    assert.equal(userId, actorId);
    assert.equal(signedWorkspaceId, workspaceId);
    assert.equal(transactionId, "8123");
    return "a".repeat(128) + "." + "b".repeat(64);
  },
});

function repository(pool) {
  return createWorkspaceMembershipRepository(pool, { identityAssertionSigner: fakeSigner });
}

function makePool({ actorRole = "owner", targetRole = "member", ownerCount = 1, workspaceExists = true, actorAccountStatus = "active", targetAccountStatus = "active" } = {}) {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      calls.push({ sql: normalized, params });
      if (normalized === "SELECT txid_current()::text AS transaction_id") {
        return { rowCount: 1, rows: [{ transaction_id: "8123" }] };
      }
      if (normalized.startsWith("SELECT set_config('app.identity_assertion'")) {
        return { rowCount: 1, rows: [{ set_config: params[0] }] };
      }
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(normalized)) {
        return { rowCount: null, rows: [] };
      }
      if (normalized.startsWith("SELECT id FROM workspaces")) {
        return { rowCount: workspaceExists ? 1 : 0, rows: workspaceExists ? [{ id: workspaceId }] : [] };
      }
      if (normalized.startsWith("SELECT m.user_id, m.workspace_id, m.role, m.status")) {
        return { rowCount: 2, rows: [
          { user_id: actorId, workspace_id: workspaceId, role: actorRole, status: "active", account_status: actorAccountStatus },
          { user_id: targetId, workspace_id: workspaceId, role: targetRole, status: "active", account_status: targetAccountStatus },
        ] };
      }
      if (normalized.startsWith("SELECT count(*)::int AS active_owner_count")) {
        return { rowCount: 1, rows: [{ active_owner_count: ownerCount }] };
      }
      if (normalized.startsWith("UPDATE workspace_memberships")) {
        return { rowCount: 1, rows: [{
          user_id: targetId, workspace_id: workspaceId,
          role: params[2] ?? targetRole,
          status: params[2] === null ? "revoked" : "active",
          updated_at: "2026-11-17T00:00:00.000Z",
        }] };
      }
      if (normalized.startsWith("INSERT INTO audit_events")) {
        return { rowCount: 1, rows: [] };
      }
      throw new Error("Unexpected SQL in test double: " + normalized);
    },
    release() { calls.push({ sql: "RELEASE", params: [] }); },
  };
  return { calls, pool: { async connect() { return client; } } };
}

const change = (overrides = {}) => ({
  workspaceId,
  authenticatedPrincipal: { userId: actorId },
  targetUserId: targetId,
  newRole: "viewer",
  requestId,
  ...overrides,
});

test("owner can change member role and audit in one transaction using a signed identity assertion", async () => {
  const { pool, calls } = makePool();
  const result = await repository(pool).changeRole(change());
  assert.equal(result.allowed, true);
  assert.equal(result.membership.role, "viewer");
  assert.ok(calls.some((x) => x.sql === "COMMIT"));
  assert.ok(calls.some((x) => x.sql.startsWith("INSERT INTO audit_events")));
  const assertion = calls.find((x) => x.sql.startsWith("SELECT set_config('app.identity_assertion'"));
  assert.ok(assertion);
  assert.equal(assertion.params[0].length, 193);
  assert.ok(calls.findIndex((x) => x.sql.startsWith("SELECT txid_current")) < calls.indexOf(assertion));
  assert.equal(calls.at(-1).sql, "RELEASE");
});

test("last owner cannot be revoked", async () => {
  const { pool, calls } = makePool({ actorRole: "owner", targetRole: "owner", ownerCount: 1 });
  const result = await repository(pool).changeRole(change({ targetUserId: actorId, newRole: null }));
  assert.deepEqual(result, { allowed: false, reason: "LAST_OWNER_INVARIANT" });
  assert.ok(calls.some((x) => x.sql === "ROLLBACK"));
  assert.ok(!calls.some((x) => x.sql === "COMMIT"));
  assert.ok(!calls.some((x) => x.sql.startsWith("UPDATE workspace_memberships")));
});

test("admin cannot change owner membership", async () => {
  const { pool } = makePool({ actorRole: "admin", targetRole: "owner", ownerCount: 2 });
  const result = await repository(pool).changeRole(change({ newRole: "viewer" }));
  assert.deepEqual(result, { allowed: false, reason: "CANNOT_CHANGE_PRIVILEGED_MEMBER" });
});

test("unknown workspace fails closed", async () => {
  const { pool, calls } = makePool({ workspaceExists: false });
  const result = await repository(pool).changeRole(change());
  assert.deepEqual(result, { allowed: false, reason: "WORKSPACE_NOT_FOUND" });
  assert.ok(calls.some((x) => x.sql === "ROLLBACK"));
});

test("invalid identifiers are rejected before connecting", async () => {
  let connected = false;
  const repo = repository({ async connect() { connected = true; throw new Error("must not connect"); } });
  await assert.rejects(repo.changeRole(change({ workspaceId: "not-a-uuid" })), /workspaceId must be a valid UUID/);
  assert.equal(connected, false);
});

test("invalid role is rejected before connecting", async () => {
  let connected = false;
  const repo = repository({ async connect() { connected = true; throw new Error("must not connect"); } });
  await assert.rejects(repo.changeRole(change({ newRole: "superuser" })), /newRole is invalid/);
  assert.equal(connected, false);
});

test("disabled actor account cannot change membership", async () => {
  const { pool, calls } = makePool({ actorAccountStatus: "disabled" });
  const result = await repository(pool).changeRole(change());
  assert.deepEqual(result, { allowed: false, reason: "ACTOR_ACCOUNT_DISABLED" });
  assert.ok(calls.some((x) => x.sql === "ROLLBACK"));
  assert.ok(!calls.some((x) => x.sql.startsWith("UPDATE workspace_memberships")));
});

test("disabled target account cannot be modified through membership role changes", async () => {
  const { pool, calls } = makePool({ targetAccountStatus: "disabled" });
  const result = await repository(pool).changeRole(change());
  assert.deepEqual(result, { allowed: false, reason: "TARGET_ACCOUNT_DISABLED" });
  assert.ok(calls.some((x) => x.sql === "ROLLBACK"));
  assert.ok(!calls.some((x) => x.sql.startsWith("UPDATE workspace_memberships")));
});

test("whitespace-only request IDs are rejected before connecting", async () => {
  let connected = false;
  const repo = repository({ async connect() { connected = true; throw new Error("must not connect"); } });
  await assert.rejects(repo.changeRole(change({ requestId: "   " })), /requestId must contain 1 to 128 characters/);
  assert.equal(connected, false);
});

test("query values are parameterized rather than interpolated", async () => {
  const { pool, calls } = makePool();
  await repository(pool).changeRole(change());
  const update = calls.find((x) => x.sql.startsWith("UPDATE workspace_memberships"));
  assert.ok(update);
  assert.deepEqual(update.params.slice(0, 3), [workspaceId, targetId, "viewer"]);
  assert.ok(!update.sql.includes(targetId));
});

test("repository refuses to operate without an assertion signer", () => {
  assert.throws(() => createWorkspaceMembershipRepository({ connect() {} }), /assertion signer is required/);
});

test("repository requires a validated-principal-shaped user identifier", async () => {
  let connected = false;
  const repo = repository({ async connect() { connected = true; throw new Error("must not connect"); } });
  await assert.rejects(repo.changeRole(change({ authenticatedPrincipal: { userId: "spoofed" } })), /authenticatedPrincipal.userId/);
  assert.equal(connected, false);
});

test("signer failure rolls back before tenant queries", async () => {
  const { calls, pool } = makePool();
  const broken = createWorkspaceMembershipRepository(pool, { identityAssertionSigner: { sign() { throw new Error("signer unavailable"); } } });
  await assert.rejects(broken.changeRole(change()), /signer unavailable/);
  assert.ok(calls.some((x) => x.sql === "ROLLBACK"));
  assert.ok(!calls.some((x) => x.sql.startsWith("SELECT id FROM workspaces")));
});
