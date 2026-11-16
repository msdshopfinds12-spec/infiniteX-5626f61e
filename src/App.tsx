import { useMemo, useState } from "react";
import { Activity, Bot, Cpu, GitBranch, Play, Search, Settings, ShieldCheck, Terminal, Zap } from "lucide-react";
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

  const metrics = useMemo(
    () => [
      {
        id: "agents",
        label: "Agent telemetry",
        value: "Not connected",
        delta: "No live data",
        trend: "up" as const,
        icon: Bot,
        accent: "primary" as const,
      },
      {
        id: "runs",
        label: "Pipeline runs",
        value: "Not connected",
        delta: "No live data",
        trend: "up" as const,
        icon: GitBranch,
        accent: "success" as const,
      },
      {
        id: "tokens",
        label: "Token usage",
        value: "Not connected",
        delta: "No live data",
        trend: "up" as const,
        icon: Zap,
        accent: "warning" as const,
      },
      {
        id: "uptime",
        label: "Service uptime",
        value: "Not measured",
        delta: "No health probe",
        trend: "flat" as const,
        icon: Activity,
        accent: "neutral" as const,
      },
    ],
    []
  );

  const title =
    view === "overview"
      ? "Overview"
      : view === "agents"
        ? "AI Agents"
        : view === "pipelines"
          ? "Pipelines"
          : view === "logs"
            ? "Log Stream"
            : view === "security"
              ? "Security Posture"
              : "Settings";

  return (
    <>
      <div className="app-shell">
        <Sidebar view={view} onChange={setView} />
        <div className="main">
          <TopBar title={title} theme={theme} onToggleTheme={toggleTheme} />
          <main className="content">
          <section className="panel" aria-label="Workspace data status"><div className="panel-head"><h2>Workspace data status</h2><span className="badge badge-warning">DEMO MODE</span></div><p className="muted">Sample interface only. Agent activity, logs, pipeline states, and metrics are illustrative; no live integrations or telemetry are currently connected.</p></section>
          {view === "overview" && (
            <>
              <section className="metrics">
                {metrics.map((m) => (
                  <MetricCard key={m.id} {...m} />
                ))}
              </section>
              <section className="grid-2">
                <div className="panel">
                  <div className="panel-head">
                    <h2>
                      <Cpu size={18} /> Sample Agent Activity
                    </h2>
                    <span className="badge badge-warning">sample</span>
                  </div>
                  <AgentList compact />
                </div>
                <div className="panel">
                  <div className="panel-head">
                    <h2>
                      <Terminal size={18} /> Sample Log Events
                    </h2>
                    <span className="badge badge-warning">sample</span>
                  </div>
                  <LogStream compact />
                </div>
              </section>
              <section className="panel">
                <div className="panel-head">
                  <h2>
                    <GitBranch size={18} /> Pipeline Board
                  </h2>
                  <button className="btn btn-ghost">
                    <Play size={14} /> Run all
                  </button>
                </div>
                <PipelineBoard />
              </section>
            </>
          )}
          {view === "agents" && (
            <div className="panel">
              <div className="panel-head">
                <h2>
                  <Bot size={18} /> Registered AI Agents
                </h2>
                <div className="search">
                  <Search size={14} />
                  <input placeholder="Filter agents..." />
                </div>
              </div>
              <AgentList />
            </div>
          )}
          {view === "pipelines" && (
            <div className="panel">
              <div className="panel-head">
                <h2>
                  <GitBranch size={18} /> Pipeline Board
                </h2>
                <button className="btn btn-primary">
                  <Play size={14} /> New pipeline
                </button>
              </div>
              <PipelineBoard expanded />
            </div>
          )}
          {view === "logs" && (
            <div className="panel">
              <div className="panel-head">
                <h2>
                  <Terminal size={18} /> Sample Log Events
                </h2>
                <span className="badge badge-warning">sample</span>
              </div>
              <LogStream />
            </div>
          )}
          {view === "security" && (
            <div className="panel">
              <div className="panel-head">
                <h2>
                  <ShieldCheck size={18} /> Security Posture
                </h2>
                <span className="badge badge-warning">not verified</span>
              </div>
              <p className="muted">Security controls are not yet connected to automated evidence. These are audit requirements, not claims that controls are enabled.</p>
              <ul className="checklist">
                {["Database Row Level Security: verification pending","Client bundle secret scan: verification pending","CORS and Origin policy: verification pending","Secret storage and rotation: verification pending","Authorization checks on mutations: verification pending"].map((item) => (<li key={item}><span className="badge badge-warning">pending</span>{item}</li>))}
              </ul>
            </div>
          )}
          {view === "settings" && (
            <div className="panel">
              <div className="panel-head">
                <h2>
                  <Settings size={18} /> Workspace Settings
                </h2>
              </div>
              <p className="muted">
                Configure model providers, runtime limits, and deployment
                targets. Connect accounts under each section to enable agents.
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
