import type { AuthState } from "./auth-state.ts";

export type AuthBootstrapConfiguration =
  | Readonly<{ status: "ready" }>
  | Readonly<{ status: "missing" }>
  | Readonly<{ status: "invalid" }>;

/**
 * Missing or invalid auth configuration must never silently unlock the app.
 * The UI receives only a generic error state; config details and credentials
 * are not copied into user-facing state.
 */
export function resolveAuthBootstrapState(
  configuration: AuthBootstrapConfiguration,
): AuthState | null {
  if (configuration.status === "ready") return null;
  return { status: "error", identityEpoch: 0 };
}
