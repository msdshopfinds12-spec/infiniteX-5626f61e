import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthSessionProvider, useAuthState } from "./features/auth/auth-session-provider";
import { createSupabaseAuthSessionAdapter } from "./features/auth/supabase-auth-session-adapter";
import { createBrowserSupabaseClient } from "./lib/supabase/client";
import "./styles/global.css";

const supabaseResult = createBrowserSupabaseClient({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
});

function ConnectedApp() {
  const authState = useAuthState();
  return <App authState={authState} />;
}

function Root() {
  if (supabaseResult.status !== "ready") {
    return <App />;
  }

  return (
    <AuthSessionProvider
      adapter={createSupabaseAuthSessionAdapter(supabaseResult.client)}
    >
      <ConnectedApp />
    </AuthSessionProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
