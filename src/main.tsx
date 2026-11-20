import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthSessionProvider, useAuthActions, useAuthRecoveryMode, useAuthState } from "./features/auth/auth-session-provider";
import { resolveAuthBootstrapState } from "./features/auth/auth-bootstrap.ts";
import { createSupabaseAuthSessionAdapter } from "./features/auth/supabase-auth-session-adapter";
import { createBrowserSupabaseClient } from "./lib/supabase/client";
import { createWorkflowReadService } from "./features/workflows/workflow-read-service";
import { createProfileReadService } from "./features/profile/profile-read-service";
import { createProjectReadService } from "./features/projects/project-read-service";
import "./styles/global.css";

const supabaseResult = createBrowserSupabaseClient({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
});

const authAdapter =
  supabaseResult.status === "ready"
    ? createSupabaseAuthSessionAdapter(supabaseResult.client)
    : null;

const workflowReadService =
  supabaseResult.status === "ready"
    ? createWorkflowReadService(supabaseResult.client)
    : null;

const profileReadService =
  supabaseResult.status === "ready"
    ? createProfileReadService(supabaseResult.client)
    : null;

const projectReadService =
  supabaseResult.status === "ready"
    ? createProjectReadService(supabaseResult.client)
    : null;

function ConnectedApp() {
  const authState = useAuthState();
  const authActions = useAuthActions();
  const recoveryMode = useAuthRecoveryMode();
  return (
    <App
      authState={authState}
      authActions={authActions}
      recoveryMode={recoveryMode}
      workflowReadService={workflowReadService}
      profileReadService={profileReadService}
      projectReadService={projectReadService}
    />
  );
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
