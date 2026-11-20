import {
  createInitialAuthState,
  resolveAuthSession,
  type AuthSessionIdentity,
  type AuthState,
} from "./auth-state.ts";

export type AuthSessionReadResult = Readonly<{
  applied: boolean;
  state: AuthState;
}>;

export type AuthSessionCoordinator = Readonly<{
  getState: () => AuthState;
  captureInitialReadRevision: () => number;
  applyAuthEvent: (session: AuthSessionIdentity | null) => AuthState;
  applyInitialSession: (
    capturedRevision: number,
    session: AuthSessionIdentity | null,
  ) => AuthSessionReadResult;
  applyInitialError: (capturedRevision: number) => AuthSessionReadResult;
}>;

/**
 * Coordinates the asynchronous initial session read with auth subscription
 * events. If an auth event arrives while getSession() is pending, its newer
 * identity wins and the stale initial result is discarded.
 *
 * Keep this coordinator free of SDK/network concerns so race behavior remains
 * deterministic and independently testable.
 */
export function createAuthSessionCoordinator(): AuthSessionCoordinator {
  let state = createInitialAuthState();
  let revision = 0;

  return Object.freeze({
    getState: () => state,

    captureInitialReadRevision: () => revision,

    applyAuthEvent: (session: AuthSessionIdentity | null) => {
      revision += 1;
      state = resolveAuthSession(state, session);
      return state;
    },

    applyInitialSession: (
      capturedRevision: number,
      session: AuthSessionIdentity | null,
    ): AuthSessionReadResult => {
      if (capturedRevision !== revision) {
        return { applied: false, state };
      }

      revision += 1;
      state = resolveAuthSession(state, session);
      return { applied: true, state };
    },

    applyInitialError: (capturedRevision: number): AuthSessionReadResult => {
      if (capturedRevision !== revision) {
        return { applied: false, state };
      }

      revision += 1;
      state = {
        status: "error",
        identityEpoch: state.identityEpoch + 1,
      };
      return { applied: true, state };
    },
  });
}
