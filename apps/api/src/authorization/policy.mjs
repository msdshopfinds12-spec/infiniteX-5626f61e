const VALID_ROLES = new Set(["owner", "admin", "member", "viewer"]);

const ROLE_PERMISSIONS = Object.freeze({
  owner: new Set([
    "workspace:read",
    "workspace:update",
    "workspace:transfer-owner",
    "workspace:delete",
    "member:invite",
    "member:role:update",
    "content:create",
    "content:read",
    "content:update:own",
    "content:update:any",
    "content:delete:own",
    "content:delete:any",
    "audit:read",
  ]),
  admin: new Set([
    "workspace:read",
    "workspace:update",
    "member:invite",
    "member:role:update",
    "content:create",
    "content:read",
    "content:update:own",
    "content:update:any",
    "content:delete:own",
    "content:delete:any",
    "audit:read",
  ]),
  member: new Set([
    "workspace:read",
    "content:create",
    "content:read",
    "content:update:own",
    "content:delete:own",
  ]),
  viewer: new Set(["workspace:read", "content:read"]),
});

const deny = (reason) => Object.freeze({ allowed: false, reason });
const allow = (role) => Object.freeze({
  allowed: true,
  role,
  policyVersion: "workspace-policy-v1",
});

export function authorizeWorkspaceAction({
  principal,
  membership,
  workspaceId,
  permission,
  resourceOwnerId,
}) {
  if (!principal || typeof principal.userId !== "string" || !principal.userId.trim()) {
    return deny("UNAUTHENTICATED");
  }

  if (principal.active === false) {
    return deny("ACCOUNT_DISABLED");
  }

  if (!membership || membership.status !== "active") {
    return deny("NO_ACTIVE_MEMBERSHIP");
  }

  if (
    membership.userId !== principal.userId ||
    membership.workspaceId !== workspaceId ||
    typeof workspaceId !== "string" ||
    !workspaceId.trim()
  ) {
    return deny("WORKSPACE_SCOPE_MISMATCH");
  }

  if (!VALID_ROLES.has(membership.role)) {
    return deny("INVALID_ROLE");
  }

  if (typeof permission !== "string" || !permission.trim()) {
    return deny("INVALID_PERMISSION");
  }

  const granted = ROLE_PERMISSIONS[membership.role];
  if (!granted.has(permission)) {
    return deny("PERMISSION_DENIED");
  }

  if (
    (permission === "content:update:own" || permission === "content:delete:own") &&
    resourceOwnerId !== principal.userId
  ) {
    return deny("RESOURCE_NOT_OWNED");
  }

  return allow(membership.role);
}

export function authorizeWorkspaceRoleChange({
  actorMembership,
  targetMembership,
  newRole,
  activeOwnerCount,
}) {
  if (!actorMembership || actorMembership.status !== "active") {
    return deny("ACTOR_NOT_ACTIVE");
  }

  if (!targetMembership || targetMembership.status !== "active") {
    return deny("TARGET_NOT_ACTIVE");
  }

  if (
    !actorMembership.workspaceId ||
    actorMembership.workspaceId !== targetMembership.workspaceId
  ) {
    return deny("WORKSPACE_SCOPE_MISMATCH");
  }

  if (!VALID_ROLES.has(actorMembership.role)) {
    return deny("INVALID_ACTOR_ROLE");
  }

  if (newRole !== null && !VALID_ROLES.has(newRole)) {
    return deny("INVALID_TARGET_ROLE");
  }

  if (!Number.isInteger(activeOwnerCount) || activeOwnerCount < 0) {
    return deny("INVALID_OWNER_COUNT");
  }

  if (newRole === "owner") {
    return deny("USE_EXPLICIT_OWNERSHIP_TRANSFER");
  }

  if (actorMembership.role !== "owner" && actorMembership.role !== "admin") {
    return deny("PERMISSION_DENIED");
  }

  if (actorMembership.role === "admin") {
    if (targetMembership.role === "owner") {
      return deny("CANNOT_CHANGE_OWNER");
    }
    if (newRole === null || newRole === "admin") {
      return deny("ADMIN_SCOPE_LIMIT");
    }
  }

  if (
    targetMembership.role === "owner" &&
    newRole !== "owner" &&
    activeOwnerCount <= 1
  ) {
    return deny("LAST_OWNER_INVARIANT");
  }

  return Object.freeze({
    allowed: true,
    policyVersion: "workspace-policy-v1",
  });
}

export const workspacePolicy = Object.freeze({
  version: "workspace-policy-v1",
  roles: Object.freeze([...VALID_ROLES]),
  permissionsByRole: Object.freeze(
    Object.fromEntries(
      Object.entries(ROLE_PERMISSIONS).map(([role, permissions]) => [
        role,
        Object.freeze([...permissions]),
      ]),
    ),
  ),
});
