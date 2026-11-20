import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createAuthSessionCoordinator,
} from "./auth-session-coordinator.ts";
import type { AuthSessionIdentity, AuthState } from "./auth-state.ts";

/**
 * Small adapter contract between React and an authentication provider.
 * The Supabase implementation must map its SDK session to { user: { id } }
 * and return the SDK subscription's unsubscribe function.
 */
export type AuthSessionAdapter = Readonly<{
  getSession: () => Promise<AuthSessionIdentity | null>;
  onAuthStateChange: (
    listener: (session: AuthSessionIdentity | null) => void,
  ) => () => void;
}>;

const AuthStateContext = createContext<AuthState | null>(null);

export type AuthSessionProviderProps = Readonly<{
  adapter: AuthSessionAdapter;
  children: ReactNode;
}>;

/**
 * Provider-neutral React session provider.
 *
 * Subscribe before requesting the initial session so that auth events cannot
 * be missed during startup. The coordinator fences late initial results.
 * Cleanup prevents callbacks from a prior mount/adapter from updating state.
 */
export function AuthSessionProvider({
  adapter,
  children,
}: AuthSessionProviderProps) {
  const coordinator = useMemo(() => createAuthSessionCoordinator(), [adapter]);
  const [state, setState] = useState<AuthState>(() => coordinator.getState());

  useEffect(() => {
    let active = true;
    setState(coordinator.getState());

    const revision = coordinator.captureInitialReadRevision();
    let unsubscribe: (() => void) | undefined;

    try {
      unsubscribe = adapter.onAuthStateChange((session) => {
        if (!active) return;
        setState(coordinator.applyAuthEvent(session));
      });
    } catch {
      if (active) {
        setState(coordinator.applyInitialError(revision).state);
      }
      return () => {
        active = false;
      };
    }

    void adapter.getSession().then(
      (session) => {
        if (!active) return;
        const result = coordinator.applyInitialSession(revision, session);
        if (result.applied) setState(result.state);
      },
      () => {
        if (!active) return;
        const result = coordinator.applyInitialError(revision);
        if (result.applied) setState(result.state);
      },
    );

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [adapter, coordinator]);

  return (
    <AuthStateContext.Provider value={state}>
      {children}
    </AuthStateContext.Provider>
  );
}

/** Must be called below an AuthSessionProvider. */
export function useAuthState(): AuthState {
  const state = useContext(AuthStateContext);
  if (state === null) {
    throw new Error("useAuthState must be used within AuthSessionProvider");
  }
  return state;
}
