import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthSessionProvider, useAuthActions, useAuthState } from "./features/auth/auth-session-provider";
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
  return <App authState={authState} authActions={authActions} />;
}

function Root() {
  if (!authAdapter) {
    return <App />;
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
