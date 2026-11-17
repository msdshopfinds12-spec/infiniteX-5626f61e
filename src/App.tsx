import { useState } from "react";
import { Activity, Bot, Cpu, GitBranch, Play, Settings, ShieldAlert, Terminal, Zap } from "lucide-react";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import { useTheme } from "./hooks/useTheme";
import MetricCard from "./components/MetricCard";
import AgentList from "./components/AgentList";
import PipelineBoard from "./components/PipelineBoard";
import LogStream from "./components/LogStream";
import type { Metric, ViewKey } from "./types";

const metrics: Metric[] = [
  { id: "agents", label: "Agent telemetry", value: "Unavailable", delta: "No connected data source", trend: "flat", icon: Bot, accent: "primary" },
  { id: "runs", label: "Pipeline runs", value: "Unavailable", delta: "No connected data source", trend: "flat", icon: GitBranch, accent: "success" },
  { id: "tokens", label: "Token usage", value: "Unavailable", delta: "No connected data source", trend: "flat", icon: Zap, accent: "warning" },
  { id: "uptime", label: "System uptime", value: "Unavailable", delta: "No verified health probe", trend: "flat", icon: Activity, accent: "neutral" },
];

const titles: Record<ViewKey, string> = {
  overview: "Overview",
  agents: "AI Agents",
  pipelines: "Pipelines",
  logs: "Sample Logs",
  security: "Security Posture",
  settings: "Settings",
};

export default function App() {
  const [view, setView] = useState<ViewKey>("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [notice, setNotice] = useState("");
  const { theme, toggleTheme } = useTheme();

  function handleSearchChange(value: string) {
    setSearchQuery(value);
    if (value.trim()) setView("agents");
  }

  return (
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <div className="app-shell">
      <Sidebar view={view} onChange={setView} />
      <div className="main">
        <TopBar
          title={titles[view]}
          theme={theme}
          onToggleTheme={toggleTheme}
          searchValue={searchQuery}
          onSearchChange={handleSearchChange}
        />
        <main id="main-content" className="content" tabIndex={-1}>
          {notice && (
            <div className="notice" role="status">
              <span>{notice}</span>
              <button className="notice-dismiss" type="button" onClick={() => setNotice("")} aria-label="Dismiss message">Dismiss</button>
            </div>
          )}

          {view === "overview" && (
            <>
              <div className="environment-banner">
                <span className="environment-dot" />
                <div>
                  <strong>Demo workspace</strong>
                  <span>Sample records only · live providers are not connected</span>
                </div>
              </div>
              <section className="metrics" aria-label="Connection status">
                {metrics.map((metric) => <MetricCard key={metric.id} {...metric} />)}
              </section>
              <section className="grid-2">
                <div className="panel">
                  <div className="panel-head">
                    <h2><Cpu size={18} /> Agent registry</h2>
                    <span className="badge badge-neutral">sample data</span>
                  </div>
                  <AgentList compact />
                </div>
                <div className="panel">
                  <div className="panel-head">
                    <h2><Terminal size={18} /> Example activity</h2>
                    <span className="badge badge-neutral">sample data</span>
                  </div>
                  <LogStream compact />
                </div>
              </section>
              <section className="panel">
                <div className="panel-head">
                  <h2><GitBranch size={18} /> Pipeline examples</h2>
                  <button className="btn btn-ghost" type="button" onClick={() => setNotice("Preview only: pipeline execution is not connected. No job was started.")}>
                    <Play size={14} /> Preview action
                  </button>
                </div>
                <PipelineBoard />
              </section>
            </>
          )}

          {view === "agents" && (
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h2><Bot size={18} /> Registered agent examples</h2>
                  <p className="panel-description">Search filters local sample records only.</p>
                </div>
                <span className="badge badge-neutral">sample data</span>
              </div>
              <AgentList searchTerm={searchQuery} />
            </div>
          )}

          {view === "pipelines" && (
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h2><GitBranch size={18} /> Pipeline examples</h2>
                  <p className="panel-description">These stages are illustrative and are not executing.</p>
                </div>
                <button className="btn btn-primary" type="button" onClick={() => setNotice("Preview only: pipeline creation is not connected. No pipeline was created.")}>
                  <Play size={14} /> Preview draft flow
                </button>
              </div>
              <PipelineBoard expanded />
            </div>
          )}

          {view === "logs" && (
            <div className="panel">
              <div className="panel-head">
                <h2><Terminal size={18} /> Example log entries</h2>
                <span className="badge badge-neutral">sample data</span>
              </div>
              <LogStream />
            </div>
          )}

          {view === "security" && (
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h2><ShieldAlert size={18} /> Security verification</h2>
                  <p className="panel-description">Frontend display only; no backend security audit has been run.</p>
                </div>
                <span className="badge badge-warning">not verified</span>
              </div>
              <ul className="checklist security-list">
                {[
                  "Database Row Level Security — not verified",
                  "Server-only secret handling — not verified",
                  "API and CORS authorization — not verified",
                  "Provider secret storage — not verified",
                  "Mutation authentication and authorization — not verified",
                ].map((item) => <li key={item}><span className="verification-mark" aria-hidden="true">?</span>{item}</li>)}
              </ul>
            </div>
          )}

          {view === "settings" && (
            <div className="panel">
              <div className="panel-head"><h2><Settings size={18} /> Workspace settings</h2></div>
              <p className="muted">Provider configuration is not connected in this frontend-only phase. No credentials are requested or stored here.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
