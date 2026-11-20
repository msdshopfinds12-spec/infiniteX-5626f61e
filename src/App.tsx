import { useMemo, useState } from "react";
import { Activity, Bot, Cpu, GitBranch, Play, Search, Settings, ShieldAlert, Terminal, Zap } from "lucide-react";
import { Analytics } from "@vercel/analytics/react";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import { useTheme } from "./hooks/useTheme";
import MetricCard from "./components/MetricCard";
import AgentList from "./components/AgentList";
import PipelineBoard from "./components/PipelineBoard";
import LogStream from "./components/LogStream";
import type { ViewKey } from "./types";

export default function App() {
  const [view, setView] = useState<ViewKey>("overview");
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
            <div className="demo-notice" role="status">
              <strong>DEMO MODE</strong>
              <span>Illustrative sample data only. No live backend, agent runtime, pipeline, log stream or security scan is connected or verified.</span>
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
