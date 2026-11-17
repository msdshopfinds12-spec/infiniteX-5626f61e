import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresMembershipRepository } from "../src/authorization/postgres-membership-repository.mjs";
import { authorizeWorkspaceRoleChange } from "../src/authorization/policy.mjs";

const WORKSPACE = "f2c5a4e1-91d7-4b3c-a8c7-8e4b51a5e111";
const OWNER = "2d931510-d99f-494a-8c67-87feb05e1594";
const MEMBER = "3d931510-d99f-494a-8c67-87feb05e1595";

function rows({ ownerCount = 1 } = {}) {
  const result = [
    { userId: OWNER, workspaceId: WORKSPACE, role: "owner", status: "active" },
    { userId: MEMBER, workspaceId: WORKSPACE, role: "member", status: "active" }
  ];
  for (let i = 1; i < ownerCount; i += 1) {
    result.push({
      userId: `4d931510-d99f-494a-8c67-87feb05e15${String(i).padStart(2, "0")}`,
      workspaceId: WORKSPACE, role: "owner", status: "active"
    });
  }
  return result;
}

function fakePool({ membershipRows = rows(), updateRows = null, rowCount = 1 } = {}) {
  const calls = [];
  let released = false;
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes("FROM workspace_memberships") && sql.includes("FOR UPDATE")) {
        return { rows: membershipRows };
      }
      if (sql.includes("UPDATE workspace_memberships")) {
        return { rows: updateRows ?? [{
          userId: MEMBER, workspaceId: WORKSPACE, role: values[2], status: "active"
        }], rowCount };
      }
      return { rows: [], rowCount: 0 };
    },
    release() { released = true; }
  };
  return {
    calls,
    get released() { return released; },
    pool: {
      async connect() { return client; },
      async query(sql, values) { calls.push({ sql, values }); return { rows: [] }; }
    }
  };
}

test("membership lookup is scoped to an active user/workspace pair", async () => {
  const fake = fakePool();
  const result = await createPostgresMembershipRepository({ pool: fake.pool })
    .findActiveMembership({ userId: OWNER, workspaceId: WORKSPACE });
  assert.equal(result, null);
  assert.match(fake.calls[0].sql, /status = 'active'/);
  assert.deepEqual(fake.calls[0].values, [OWNER, WORKSPACE]);
});

test("role changes lock workspace memberships and commit one authorized update", async () => {
  const fake = fakePool();
  const result = await createPostgresMembershipRepository({ pool: fake.pool }).changeRole({
    actorUserId: OWNER, targetUserId: MEMBER, workspaceId: WORKSPACE, newRole: "viewer"
  });
  assert.equal(result.allowed, true);
  assert.equal(result.membership.role, "viewer");
  assert.equal(fake.calls[0].sql, "BEGIN");
  assert.match(fake.calls[1].sql, /ORDER BY user_id\s+FOR UPDATE/);
  assert.match(fake.calls[2].sql, /UPDATE workspace_memberships/);
  assert.equal(fake.calls.at(-1).sql, "COMMIT");
  assert.equal(fake.released, true);
});

test("last-owner invariant is enforced by the authorization policy", () => {
  const owner = { userId: OWNER, workspaceId: WORKSPACE, role: "owner", status: "active" };
  const otherOwner = { userId: MEMBER, workspaceId: WORKSPACE, role: "owner", status: "active" };
  const decision = authorizeWorkspaceRoleChange({
    actorMembership: owner, targetMembership: otherOwner,
    newRole: "member", activeOwnerCount: 1
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "LAST_OWNER_INVARIANT");
});

test("policy rejects null roles and explicit owner assignment", () => {
  const owner = { userId: OWNER, workspaceId: WORKSPACE, role: "owner", status: "active" };
  const member = { userId: MEMBER, workspaceId: WORKSPACE, role: "member", status: "active" };
  assert.equal(authorizeWorkspaceRoleChange({
    actorMembership: owner, targetMembership: member, newRole: null, activeOwnerCount: 1
  }).reason, "INVALID_TARGET_ROLE");
  assert.equal(authorizeWorkspaceRoleChange({
    actorMembership: owner, targetMembership: member, newRole: "owner", activeOwnerCount: 1
  }).reason, "USE_EXPLICIT_OWNERSHIP_TRANSFER");
});

test("role change rejects invalid IDs and self-change before opening a transaction", async () => {
  const fake = fakePool();
  const repository = createPostgresMembershipRepository({ pool: fake.pool });
  await assert.rejects(() => repository.changeRole({
    actorUserId: "bad", targetUserId: MEMBER, workspaceId: WORKSPACE, newRole: "viewer"
  }), /UUID/);
  const result = await repository.changeRole({
    actorUserId: OWNER, targetUserId: OWNER, workspaceId: WORKSPACE, newRole: "viewer"
  });
  assert.equal(result.reason, "SELF_ROLE_CHANGE_DENIED");
  assert.equal(fake.calls.length, 0);
});


test("role changes normalize uppercase UUID inputs before row matching", async () => {
  const fake = fakePool();
  const result = await createPostgresMembershipRepository({ pool: fake.pool }).changeRole({
    actorUserId: OWNER.toUpperCase(),
    targetUserId: MEMBER.toUpperCase(),
    workspaceId: WORKSPACE.toUpperCase(),
    newRole: "viewer"
  });
  assert.equal(result.allowed, true);
  assert.deepEqual(fake.calls[1].values, [WORKSPACE]);
  assert.deepEqual(fake.calls[2].values, [WORKSPACE, MEMBER, "viewer"]);
});

test("role update rolls back and releases client when update affects unexpected row count", async () => {
  const fake = fakePool({ rowCount: 0, updateRows: [] });
  const repository = createPostgresMembershipRepository({ pool: fake.pool });
  await assert.rejects(() => repository.changeRole({
    actorUserId: OWNER, targetUserId: MEMBER, workspaceId: WORKSPACE, newRole: "viewer"
  }), /exactly one active row/);
  assert.equal(fake.calls.at(-1).sql, "ROLLBACK");
  assert.equal(fake.released, true);
});

test("membership repository requires a connect-capable pool", () => {
  assert.throws(() => createPostgresMembershipRepository({ pool: {} }), /connect/);
});
