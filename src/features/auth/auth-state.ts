/**
 * Framework- and provider-neutral auth state contract.
 *
 * The identity epoch is a monotonically increasing fence. Async feature
 * requests capture the epoch before starting and discard their result if the
 * current epoch changes (sign-out or account switch) before completion.
 *
 * This module deliberately does not implement authentication or persist
 * credentials. The provider-specific Supabase adapter lives in
 * supabase-auth-session-adapter.ts; only public configuration reaches the
 * browser client, and exact-head CI verifies the committed SDK lockfile.
 */

export type AuthSessionIdentity = Readonly<{
  user: Readonly<{ id: string }>;
}>;

export type AuthState =
  | Readonly<{ status: "loading"; identityEpoch: number }>
  | Readonly<{ status: "anonymous"; identityEpoch: number }>
  | Readonly<{ status: "authenticated"; userId: string; identityEpoch: number }>
  | Readonly<{ status: "error"; identityEpoch: number }>;

export function createInitialAuthState(): AuthState {
  return { status: "loading", identityEpoch: 0 };
}

export function resolveAuthSession(
  previous: AuthState,
  session: AuthSessionIdentity | null,
): AuthState {
  if (!session) {
    if (previous.status === "anonymous") return previous;
    return { status: "anonymous", identityEpoch: previous.identityEpoch + 1 };
  }

  const userId = session.user.id.trim();
  if (!userId) {
    return { status: "error", identityEpoch: previous.identityEpoch + 1 };
  }

  if (previous.status === "authenticated" && previous.userId === userId) {
    return previous;
  }

  return {
    status: "authenticated",
    userId,
    identityEpoch: previous.identityEpoch + 1,
  };
}

export function isCurrentIdentityEpoch(
  state: AuthState,
  capturedEpoch: number,
): boolean {
  return state.status === "authenticated" && state.identityEpoch === capturedEpoch;
}
