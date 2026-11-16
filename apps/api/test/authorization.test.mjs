import test from "node:test";
import assert from "node:assert/strict";
import {
  authorizeWorkspaceAction,
  authorizeWorkspaceRoleChange,
  workspacePolicy,
} from "../src/authorization/policy.mjs";

const principal = { userId: "user-a", active: true };
const membership = (role = "member", overrides = {}) => ({
  userId: "user-a",
  workspaceId: "workspace-a",
  role,
  status: "active",
  ...overrides,
});

test("policy exposes a stable version and four workspace roles", () => {
  assert.equal(workspacePolicy.version, "workspace-policy-v1");
  assert.deepEqual(new Set(workspacePolicy.roles), new Set(["owner", "admin", "member", "viewer"]));
});

test("active member can create content in their workspace", () => {
  const result = authorizeWorkspaceAction({
    principal,
    membership: membership(),
    workspaceId: "workspace-a",
    permission: "content:create",
  });
  assert.equal(result.allowed, true);
  assert.equal(result.role, "member");
});

test("viewer is denied content creation", () => {
  const result = authorizeWorkspaceAction({
    principal,
    membership: membership("viewer"),
    workspaceId: "workspace-a",
    permission: "content:create",
  });
  assert.deepEqual(result, { allowed: false, reason: "PERMISSION_DENIED" });
});

test("member can update own content but not another user's content", () => {
  const own = authorizeWorkspaceAction({
    principal,
    membership: membership(),
    workspaceId: "workspace-a",
    permission: "content:update:own",
    resourceOwnerId: "user-a",
  });
  const other = authorizeWorkspaceAction({
    principal,
    membership: membership(),
    workspaceId: "workspace-a",
    permission: "content:update:own",
    resourceOwnerId: "user-b",
  });
  assert.equal(own.allowed, true);
  assert.deepEqual(other, { allowed: false, reason: "RESOURCE_NOT_OWNED" });
});

test("cross-workspace membership substitution is denied", () => {
  const result = authorizeWorkspaceAction({
    principal,
    membership: membership("owner"),
    workspaceId: "workspace-b",
    permission: "workspace:delete",
  });
  assert.deepEqual(result, { allowed: false, reason: "WORKSPACE_SCOPE_MISMATCH" });
});

test("membership belonging to another principal is denied", () => {
  const result = authorizeWorkspaceAction({
    principal,
    membership: membership("owner", { userId: "user-b" }),
    workspaceId: "workspace-a",
    permission: "workspace:delete",
  });
  assert.deepEqual(result, { allowed: false, reason: "WORKSPACE_SCOPE_MISMATCH" });
});

test("inactive account and revoked membership fail closed", () => {
  const disabled = authorizeWorkspaceAction({
    principal: { ...principal, active: false },
    membership: membership("owner"),
    workspaceId: "workspace-a",
    permission: "workspace:read",
  });
  const revoked = authorizeWorkspaceAction({
    principal,
    membership: membership("owner", { status: "revoked" }),
    workspaceId: "workspace-a",
    permission: "workspace:read",
  });
  assert.deepEqual(disabled, { allowed: false, reason: "ACCOUNT_DISABLED" });
  assert.deepEqual(revoked, { allowed: false, reason: "NO_ACTIVE_MEMBERSHIP" });
});

test("missing identity is denied", () => {
  const result = authorizeWorkspaceAction({
    principal: null,
    membership: membership("owner"),
    workspaceId: "workspace-a",
    permission: "workspace:read",
  });
  assert.deepEqual(result, { allowed: false, reason: "UNAUTHENTICATED" });
});

test("unknown role and permission are denied", () => {
  const badRole = authorizeWorkspaceAction({
    principal,
    membership: membership("superuser"),
    workspaceId: "workspace-a",
    permission: "workspace:delete",
  });
  const badPermission = authorizeWorkspaceAction({
    principal,
    membership: membership("owner"),
    workspaceId: "workspace-a",
    permission: "system:root",
  });
  assert.deepEqual(badRole, { allowed: false, reason: "INVALID_ROLE" });
  assert.deepEqual(badPermission, { allowed: false, reason: "PERMISSION_DENIED" });
});

test("admin cannot transfer ownership or grant owner role", () => {
  const transfer = authorizeWorkspaceAction({
    principal,
    membership: membership("admin"),
    workspaceId: "workspace-a",
    permission: "workspace:transfer-owner",
  });
  const grantOwner = authorizeWorkspaceRoleChange({
    actorMembership: membership("admin"),
    targetMembership: membership("member", { userId: "user-b" }),
    newRole: "owner",
    activeOwnerCount: 1,
  });
  assert.deepEqual(transfer, { allowed: false, reason: "PERMISSION_DENIED" });
  assert.deepEqual(grantOwner, { allowed: false, reason: "USE_EXPLICIT_OWNERSHIP_TRANSFER" });
});

test("admin cannot demote or remove an owner", () => {
  for (const newRole of ["member", null]) {
    const result = authorizeWorkspaceRoleChange({
      actorMembership: membership("admin"),
      targetMembership: membership("owner", { userId: "user-b" }),
      newRole,
      activeOwnerCount: 2,
    });
    assert.deepEqual(result, { allowed: false, reason: "CANNOT_CHANGE_PRIVILEGED_MEMBER" });
  }
});

test("last active owner cannot be demoted or removed", () => {
  for (const newRole of ["admin", null]) {
    const result = authorizeWorkspaceRoleChange({
      actorMembership: membership("owner"),
      targetMembership: membership("owner"),
      newRole,
      activeOwnerCount: 1,
    });
    assert.deepEqual(result, { allowed: false, reason: "LAST_OWNER_INVARIANT" });
  }
});

test("owner can change a member role but must use transfer flow to assign owner", () => {
  const allowed = authorizeWorkspaceRoleChange({
    actorMembership: membership("owner"),
    targetMembership: membership("member", { userId: "user-b" }),
    newRole: "viewer",
    activeOwnerCount: 1,
  });
  const transferRequired = authorizeWorkspaceRoleChange({
    actorMembership: membership("owner"),
    targetMembership: membership("member", { userId: "user-b" }),
    newRole: "owner",
    activeOwnerCount: 1,
  });
  assert.equal(allowed.allowed, true);
  assert.deepEqual(transferRequired, {
    allowed: false,
    reason: "USE_EXPLICIT_OWNERSHIP_TRANSFER",
  });
});

test("admin can manage member and viewer but cannot grant admin", () => {
  const member = authorizeWorkspaceRoleChange({
    actorMembership: membership("admin"),
    targetMembership: membership("member", { userId: "user-b" }),
    newRole: "viewer",
    activeOwnerCount: 1,
  });
  const admin = authorizeWorkspaceRoleChange({
    actorMembership: membership("admin"),
    targetMembership: membership("member", { userId: "user-b" }),
    newRole: "admin",
    activeOwnerCount: 1,
  });
  assert.equal(member.allowed, true);
  assert.deepEqual(admin, { allowed: false, reason: "ADMIN_SCOPE_LIMIT" });
});

test("admin cannot modify another admin membership", () => {
  const result = authorizeWorkspaceRoleChange({
    actorMembership: membership("admin"),
    targetMembership: membership("admin", { userId: "user-b" }),
    newRole: "viewer",
    activeOwnerCount: 1,
  });
  assert.deepEqual(result, {
    allowed: false,
    reason: "CANNOT_CHANGE_PRIVILEGED_MEMBER",
  });
});

test("invalid owner counts fail closed", () => {
  const result = authorizeWorkspaceRoleChange({
    actorMembership: membership("owner"),
    targetMembership: membership("member", { userId: "user-b" }),
    newRole: "viewer",
    activeOwnerCount: -1,
  });
  assert.deepEqual(result, { allowed: false, reason: "INVALID_OWNER_COUNT" });
});
