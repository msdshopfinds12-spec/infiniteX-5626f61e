import type { AuthState } from "./auth-state.ts";

export const WORKSPACE_CAPABILITIES = [
  "workspace.read",
  "agents.read",
  "agents.execute",
  "workflows.read",
  "workflows.execute",
  "logs.read",
  "security.read",
  "settings.manage",
] as const;

export type WorkspaceCapability = (typeof WORKSPACE_CAPABILITIES)[number];

/**
 * UI-facing projection returned by a future trusted authorization endpoint.
 * This is a display contract, NOT a security boundary. Server handlers and
 * database RLS must independently authorize every request and mutation.
 */
export type AuthorizationSnapshot = Readonly<{
  subjectId: string;
  permissions: readonly WorkspaceCapability[];
  expiresAt: number;
}>;

export type AuthorizationDecision =
  | Readonly<{ allowed: true }>
  | Readonly<{
      allowed: false;
      reason:
        | "unauthenticated"
        | "snapshot-unavailable"
        | "identity-mismatch"
        | "snapshot-expired"
        | "permission-denied";
    }>;

export function evaluateCapabilityAccess(
  authState: AuthState,
  snapshot: AuthorizationSnapshot | null,
  capability: WorkspaceCapability,
  now = Date.now(),
): AuthorizationDecision {
  if (authState.status !== "authenticated") {
    return { allowed: false, reason: "unauthenticated" };
  }
  if (!snapshot) {
    return { allowed: false, reason: "snapshot-unavailable" };
  }
  if (
    typeof snapshot.subjectId !== "string" ||
    snapshot.subjectId.trim().length === 0 ||
    !Array.isArray(snapshot.permissions) ||
    snapshot.permissions.some((permission) => !WORKSPACE_CAPABILITIES.includes(permission)) ||
    !Number.isFinite(snapshot.expiresAt)
  ) {
    return { allowed: false, reason: "snapshot-unavailable" };
  }
  if (snapshot.subjectId !== authState.userId) {
    return { allowed: false, reason: "identity-mismatch" };
  }
  if (snapshot.expiresAt <= now) {
    return { allowed: false, reason: "snapshot-expired" };
  }
  if (!snapshot.permissions.includes(capability)) {
    return { allowed: false, reason: "permission-denied" };
  }
  return { allowed: true };
}
