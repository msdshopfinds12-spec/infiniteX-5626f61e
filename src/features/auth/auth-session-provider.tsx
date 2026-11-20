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
import type { AuthActions } from "./auth-actions.ts";

/**
 * Provider-neutral adapter between React and the authentication provider.
 * Implementations expose only the minimal user identity to the session layer.
 */
export type AuthSessionAdapter = AuthActions & Readonly<{
  getSession: () => Promise<AuthSessionIdentity | null>;
  onAuthStateChange: (
    listener: (session: AuthSessionIdentity | null) => void,
  ) => () => void;
}>;

type AuthContextValue = Readonly<{
  state: AuthState;
  actions: AuthActions;
}>;

const AuthContext = createContext<AuthContextValue | null>(null);

export type AuthSessionProviderProps = Readonly<{
  adapter: AuthSessionAdapter;
  children: ReactNode;
}>;

/**
 * Subscribe before requesting the initial session so auth events cannot be
 * missed during startup. The coordinator fences late initial results.
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

    void Promise.resolve().then(() => adapter.getSession()).then(
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

  const contextValue = useMemo(
    () => ({ state, actions: adapter }),
    [state, adapter],
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("Authentication hooks must be used within AuthSessionProvider");
  }
  return context;
}

/** Must be called below an AuthSessionProvider. */
export function useAuthState(): AuthState {
  return useAuthContext().state;
}

/** Explicit auth actions; no credentials are persisted by this hook. */
export function useAuthActions(): AuthActions {
  return useAuthContext().actions;
}
