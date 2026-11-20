import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthSessionProvider, useAuthActions, useAuthRecoveryMode, useAuthState } from "./features/auth/auth-session-provider";
import { resolveAuthBootstrapState } from "./features/auth/auth-bootstrap.ts";
import { createSupabaseAuthSessionAdapter } from "./features/auth/supabase-auth-session-adapter";
import { createBrowserSupabaseClient } from "./lib/supabase/client";
import "./styles/global.css";

const supabaseResult = createBrowserSupabaseClient({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
});

const authAdapter =
  supabaseResult.status === "ready"
    ? createSupabaseAuthSessionAdapter(supabaseResult.client)
    : null;

function ConnectedApp() {
  const authState = useAuthState();
  const authActions = useAuthActions();
  const recoveryMode = useAuthRecoveryMode();
  return <App authState={authState} authActions={authActions} recoveryMode={recoveryMode} />;
}

function Root() {
  if (!authAdapter) {
    // Missing/invalid public auth configuration must never render the workspace.
    return <App authState={resolveAuthBootstrapState(supabaseResult)!} />;
  }

  return (
    <AuthSessionProvider adapter={authAdapter}>
      <ConnectedApp />
    </AuthSessionProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
