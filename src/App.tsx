import { useMemo, useState } from "react";
import { Activity, Bot, Cpu, GitBranch, LogOut, Play, Search, Settings, ShieldAlert, Terminal, Zap } from "lucide-react";
import { Analytics } from "@vercel/analytics/react";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import { useTheme } from "./hooks/useTheme";
import MetricCard from "./components/MetricCard";
import AgentList from "./components/AgentList";
import PipelineBoard from "./components/PipelineBoard";
import LogStream from "./components/LogStream";
import AuthScreen from "./features/auth/auth-screen";
import type { AuthActions } from "./features/auth/auth-actions";
import type { ViewKey } from "./types";
import type { AuthState } from "./features/auth/auth-state";

type AppProps = Readonly<{
  authState?: AuthState;
  authActions?: AuthActions;
}>;

export default function App({ authState, authActions }: AppProps) {
  const [view, setView] = useState<ViewKey>("overview");
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const { theme, toggleTheme } = useTheme();

  // Illustrative placeholders only; these values are not live backend telemetry.
  const metrics = useMemo(
    () => [
      { id: "agents", label: "Sample agents", value: "6", delta: "Demo data", trend: "flat" as const, icon: Bot, accent: "primary" as const },
      { id: "runs", label: "Pipeline runs", value: "—", delta: "Not connected", trend: "flat" as const, icon: GitBranch, accent: "neutral" as const },
      { id: "tokens", label: "Tokens used", value: "—", delta: "Not connected", trend: "flat" as const, icon: Zap, accent: "warning" as const },
      { id: "uptime", label: "System uptime", value: "—", delta: "Not measured", trend: "flat" as const, icon: Activity, accent: "neutral" as const },
    ],
    []
  );

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

  if (authState?.status === "error") {
    return (
      <main className="auth-status-page">
        <div className="auth-status-card" role="alert">
          <ShieldAlert size={28} />
          <h1>Session could not be verified</h1>
          <p>InfiniteX could not confirm your session. Refresh the page or check your connection. Your workspace data remains protected.</p>
          <button className="auth-submit" type="button" onClick={() => window.location.reload()}>
            Retry session check
          </button>
        </div>
      </main>
    );
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
    view === "overview" ? "Overview" :
    view === "agents" ? "AI Agents" :
    view === "pipelines" ? "Pipelines" :
    view === "logs" ? "Log Stream" :
    view === "security" ? "Security Posture" : "Settings";

  return (
    <>
      <div className="app-shell">
        <Sidebar view={view} onChange={setView} />
        <div className="main">
          <TopBar title={title} theme={theme} onToggleTheme={toggleTheme} />
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
              <strong>DEMO MODE</strong>
              <span>
                Illustrative sample data only. No live backend, agent runtime, pipeline, log stream or security scan is connected or verified.
                {authState?.status === "authenticated" && " Your session is authenticated, but dashboard data remains demo-only."}
              </span>
            </div>
            {view === "overview" && (
              <>
                <section className="metrics" aria-label="Sample metrics">
                  {metrics.map((metric) => <MetricCard key={metric.id} {...metric} />)}
                </section>
                <section className="grid-2">
                  <div className="panel">
                    <div className="panel-head">
                      <h2><Cpu size={18} /> Sample Agent Activity</h2>
                      <span className="badge badge-neutral">demo</span>
                    </div>
                    <AgentList compact />
                  </div>
                  <div className="panel">
                    <div className="panel-head">
                      <h2><Terminal size={18} /> Sample Log Entries</h2>
                      <span className="badge badge-neutral">static</span>
                    </div>
                    <LogStream compact />
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-head">
                    <h2><GitBranch size={18} /> Sample Pipeline Board</h2>
                    <button className="btn btn-ghost" type="button" disabled title="Pipeline execution is not connected">
                      <Play size={14} /> Run all unavailable
                    </button>
                  </div>
                  <PipelineBoard />
                </section>
              </>
            )}
            {view === "agents" && (
              <div className="panel">
                <div className="panel-head">
                  <h2><Bot size={18} /> Registered AI Agents (sample)</h2>
                  <div className="search" aria-label="Agent search unavailable in demo mode">
                    <Search size={14} />
                    <input placeholder="Search unavailable in demo" disabled />
                  </div>
                </div>
                <AgentList />
              </div>
            )}
            {view === "pipelines" && (
              <div className="panel">
                <div className="panel-head">
                  <h2><GitBranch size={18} /> Sample Pipeline Board</h2>
                  <button className="btn btn-primary" type="button" disabled title="Pipeline creation is not connected">
                    <Play size={14} /> Creation unavailable
                  </button>
                </div>
                <PipelineBoard expanded />
              </div>
            )}
            {view === "logs" && (
              <div className="panel">
                <div className="panel-head">
                  <h2><Terminal size={18} /> Sample Log Entries</h2>
                  <span className="badge badge-neutral">static sample</span>
                </div>
                <LogStream />
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
                  Provider, runtime and deployment settings are placeholders. No external account connection or
                  configuration change is available from this demo screen.
                </p>
              </div>
            )}
          </main>
        </div>
      </div>
      <Analytics />
    </>
  );
}
