import { useState } from "react";
import { Bot, BriefcaseBusiness, GitBranch, LogOut, Settings, ShieldAlert, Terminal, Zap } from "lucide-react";
import { Analytics } from "@vercel/analytics/react";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import { useTheme } from "./hooks/useTheme";
import AgentList from "./components/AgentList";
import LogStream from "./components/LogStream";
import AuthScreen from "./features/auth/auth-screen";
import PasswordRecoveryScreen from "./features/auth/password-recovery-screen";
import type { AuthActions } from "./features/auth/auth-actions";
import type { ViewKey } from "./types";
import type { AuthState } from "./features/auth/auth-state";
import WorkflowList from "./features/workflows/workflow-list";
import type { WorkflowReadService } from "./features/workflows/workflow-read-service";
import type { WorkflowRunService } from "./features/workflows/workflow-run-service";
import ProfileSummary from "./features/profile/profile-summary";
import type { ProfileReadService } from "./features/profile/profile-read-service";
import ProjectList from "./features/projects/project-list";
import type { ProjectReadService } from "./features/projects/project-read-service";
import OverviewSummary from "./features/overview/overview-summary";

type AppProps = Readonly<{
  authState?: AuthState;
  authActions?: AuthActions;
  recoveryMode?: boolean;
  workflowReadService?: WorkflowReadService | null;
  workflowRunService?: WorkflowRunService | null;
  profileReadService?: ProfileReadService | null;
  projectReadService?: ProjectReadService | null;
}>;

export default function App({
  authState,
  authActions,
  recoveryMode = false,
  workflowReadService = null,
  workflowRunService = null,
  profileReadService = null,
  projectReadService = null,
}: AppProps) {
  const [view, setView] = useState<ViewKey>("overview");
  const [searchTerm, setSearchTerm] = useState("");
  const query = searchTerm.trim().toLocaleLowerCase();
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const { theme, toggleTheme } = useTheme();

  if (authState?.status === "loading") {
    return (
      <main className="auth-status-page">
        <div className="auth-status-card" role="status">
          <div className="auth-brand-mark"><Zap size={21} aria-hidden="true" /></div>
          <h1>Securing your workspace</h1>
          <p>Checking your authentication session. This usually takes a moment.</p>
          <div className="auth-loading-bar" aria-hidden="true"><span /></div>
        </div>
      </main>
    );
  }

  if (!authState || authState.status === "error") {
    return (
      <main className="auth-status-page">
        <div className="auth-status-card" role="alert">
          <ShieldAlert size={28} />
          <h1>Session could not be verified</h1>
          <p>Authentication is not configured or could not be verified. Check the workspace configuration or connection, then retry. Protected workspace content remains unavailable.</p>
          <button className="auth-submit" type="button" onClick={() => window.location.reload()}>
            Retry session check
          </button>
        </div>
      </main>
    );
  }

  if (recoveryMode && authActions) {
    return <PasswordRecoveryScreen actions={authActions} />;
  }

  if (authState?.status === "anonymous" && authActions) {
    return <AuthScreen actions={authActions} />;
  }

  async function handleSignOut() {
    if (!authActions) return;
    setSignOutError(null);
    const result = await authActions.signOut();
    if (result.status === "error") setSignOutError(result.message);
  }

  const title =
    view === "overview" ? "Command Center" :
    view === "agents" ? "AI Runtime" :
    view === "pipelines" ? "Pipelines" :
    view === "projects" ? "Projects" :
    view === "logs" ? "Workflow Activity" :
    view === "security" ? "Security Posture" : "Settings";

  return (
    <>
      <div className="app-shell">
        <Sidebar view={view} workspaceLabel={authState.status === "authenticated" ? "Authenticated session" : "Preview mode"} onChange={(nextView) => { setView(nextView); setSearchTerm(""); }} />
        <div className="main">
          <TopBar title={title} theme={theme} onToggleTheme={toggleTheme} searchTerm={searchTerm} onSearchChange={setSearchTerm} />
          <main className="content">
            {authState?.status === "authenticated" && (
              <div className="account-strip">
                <span className="account-indicator"><span /> Authenticated session</span>
                <button className="btn btn-ghost account-signout" type="button" onClick={handleSignOut}>
                  <LogOut size={15} /> Sign out
                </button>
              </div>
            )}
            {signOutError && <p className="auth-inline-error" role="alert">{signOutError}</p>}
            <div className="demo-notice" role="status">
              <strong>{authState.status === "authenticated" && workflowRunService ? "WORKFLOW QUEUE ENABLED" : authState.status === "authenticated" && (workflowReadService || projectReadService || profileReadService) ? "READ-ONLY INTEGRATION" : "DEMO MODE"}</strong>
              <span>
                {authState.status === "authenticated" && workflowRunService
                  ? "Workflow, project, and profile reads use authenticated Supabase queries protected by database RLS. Workflow requests use a server-side enqueue boundary; a queued response does not prove worker execution. Worker dispatch, live AI provider execution, global logs, and production security posture remain unverified. The AI runtime request boundary is CI-verified but provider-disabled."
                  : authState.status === "authenticated" && (workflowReadService || projectReadService || profileReadService)
                    ? "Available workflow, project, and profile services use authenticated read-only Supabase queries protected by database RLS. Workflow queueing is disabled until the Phase 84 migration and Edge Function are explicitly deployed and verified. Project content is not loaded; live AI agents, global logs, and production security posture remain unavailable or unverified. The AI runtime request boundary is CI-verified but provider-disabled."
                    : "Illustrative sample data only. No live backend, agent runtime, pipeline, log stream or security scan is connected or verified."}
              </span>
            </div>
            {view === "overview" && (
              <>
                {authState.status === "authenticated" ? (
                  <OverviewSummary
                    userId={authState.userId}
                    identityEpoch={authState.identityEpoch}
                    workflowService={workflowReadService}
                    projectService={projectReadService}
                  />
                ) : (
                  <div className="panel" role="status">
                    Sign in to load your account overview.
                  </div>
                )}
                <section className="overview-capabilities" aria-label="Platform capability status">
                  <article className="capability-card">
                    <Bot size={18} aria-hidden="true" />
                    <div><strong>AI model provider</strong><span>Disabled · not configured</span></div>
                  </article>
                  <article className="capability-card">
                    <Terminal size={18} aria-hidden="true" />
                    <div><strong>Execution telemetry</strong><span>Not measured</span></div>
                  </article>
                  <article className="capability-card">
                    <ShieldAlert size={18} aria-hidden="true" />
                    <div><strong>Security posture</strong><span>Not assessed in this UI</span></div>
                  </article>
                </section>
              </>
            )}
            {view === "agents" && (
              <div className="panel">
                <div className="panel-head">
                  <h2><Bot size={18} /> AI Runtime &amp; Agent Registry</h2>
                  <span className="badge badge-neutral">PROVIDER DISABLED</span>
                </div>
                <AgentList searchTerm={query} />
              </div>
            )}
            {view === "projects" && (
              <div className="panel">
                <div className="panel-head">
                  <h2><BriefcaseBusiness size={18} /> Your Saved Projects</h2>
                  <span className="badge badge-neutral">READ ONLY</span>
                </div>
                {authState.status === "authenticated" ? (
                  <ProjectList
                    service={projectReadService}
                    userId={authState.userId}
                    identityEpoch={authState.identityEpoch}
                    searchTerm={query}
                  />
                ) : (
                  <p className="muted" role="status">Sign in to view your saved projects.</p>
                )}
              </div>
            )}
            {view === "pipelines" && (
              <div className="panel">
                <div className="panel-head">
                  <h2><GitBranch size={18} /> Your Workflows</h2>
                  <span className="badge badge-neutral">READ ONLY</span>
                </div>
                {authState.status === "authenticated" ? (
                  <WorkflowList
                    service={workflowReadService}
                    runService={workflowRunService}
                    userId={authState.userId}
                    identityEpoch={authState.identityEpoch}
                    searchTerm={query}
                  />
                ) : (
                  <p className="muted" role="status">Sign in to view account workflows.</p>
                )}
              </div>
            )}
            {view === "logs" && (
              <div className="panel">
                <div className="panel-head">
                  <h2><Terminal size={18} /> Workflow Activity</h2>
                  <span className="badge badge-neutral">PER-RUN EVENTS</span>
                </div>
                <LogStream searchTerm={query} />
              </div>
            )}
            {view === "security" && (
              <div className="panel">
                <div className="panel-head">
                  <h2><ShieldAlert size={18} /> Security Verification</h2>
                  <span className="badge badge-neutral">not verified</span>
                </div>
                <p className="muted">
                  Security controls are not verified by this demo interface. Database RLS, server-side authorization,
                  CORS policy, secret handling and mutation protections must be confirmed against the deployed backend
                  and its actual configuration before this workspace can report a security posture.
                </p>
              </div>
            )}
            {view === "settings" && (
              <div className="panel">
                <div className="panel-head">
                  <h2><Settings size={18} /> Workspace Settings</h2>
                  <span className="badge badge-neutral">not connected</span>
                </div>
                <p className="muted">
                  Account profile information is read-only in this phase. Profile editing, billing, provider
                  connections, runtime settings, and deployment controls remain disabled until their security
                  contracts and acceptance tests are complete.
                </p>
                {authState.status === "authenticated" ? (
                  <ProfileSummary
                    service={profileReadService}
                    userId={authState.userId}
                    identityEpoch={authState.identityEpoch}
                  />
                ) : (
                  <p className="muted" role="status">Sign in to view your account profile.</p>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
      <Analytics />
    </>
  );
}
