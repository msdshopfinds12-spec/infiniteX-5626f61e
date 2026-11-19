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

const descriptions: Record<ViewKey, string> = {
  overview: "A clear view of workspace structure and verified connection state.",
  agents: "Browse illustrative agent records; no provider execution is connected.",
  pipelines: "Review example workflow stages without starting jobs or deployments.",
  logs: "Inspect sample events that are not live telemetry or production alerts.",
  security: "Review the current verification boundaries and outstanding controls.",
  settings: "Workspace preferences and integration readiness.",
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
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <div className="app-shell">
        <Sidebar view={view} onChange={setView} />
        <div className="main">
          <TopBar
            title={titles[view]}
            description={descriptions[view]}
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
                  <span className="environment-dot" aria-hidden="true" />
                  <div>
                    <strong>Demo workspace</strong>
                    <span>Sample records only · live providers are not connected</span>
                  </div>
                  <span className="environment-label">LOCAL PREVIEW</span>
                </div>
                <section className="metrics" aria-label="Connection status">
                  {metrics.map((metric) => <MetricCard key={metric.id} {...metric} />)}
                </section>
                <section className="grid-2" aria-label="Workspace activity overview">
                  <div className="panel">
                    <div className="panel-head">
                      <h2><Cpu size={18} aria-hidden="true" /> Agent registry</h2>
                      <span className="badge badge-neutral">sample data</span>
                    </div>
                    <AgentList compact />
                  </div>
                  <div className="panel">
                    <div className="panel-head">
                      <h2><Terminal size={18} aria-hidden="true" /> Example activity</h2>
                      <span className="badge badge-neutral">sample data</span>
                    </div>
                    <LogStream compact />
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-head">
                    <div>
                      <h2><GitBranch size={18} aria-hidden="true" /> Pipeline examples</h2>
                      <p className="panel-description">Illustrative stages only; no workflow is running.</p>
                    </div>
                    <button className="btn btn-ghost" type="button" onClick={() => setNotice("Preview only: pipeline execution is not connected. No job was started.")}>
                      <Play size={14} aria-hidden="true" /> Preview action
                    </button>
                  </div>
                  <PipelineBoard />
                </section>
              </>
            )}

            {view === "agents" && (
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2><Bot size={18} aria-hidden="true" /> Registered agent examples</h2>
                    <p className="panel-description">Search filters local sample records only.</p>
                  </div>
                  <span className="badge badge-neutral">sample data</span>
                </div>
                <AgentList searchTerm={searchQuery} />
              </section>
            )}

            {view === "pipelines" && (
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2><GitBranch size={18} aria-hidden="true" /> Pipeline examples</h2>
                    <p className="panel-description">These stages are illustrative and are not executing.</p>
                  </div>
                  <button className="btn btn-primary" type="button" onClick={() => setNotice("Preview only: pipeline creation is not connected. No pipeline was created.")}>
                    <Play size={14} aria-hidden="true" /> Preview draft flow
                  </button>
                </div>
                <PipelineBoard expanded />
              </section>
            )}

            {view === "logs" && (
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2><Terminal size={18} aria-hidden="true" /> Example log entries</h2>
                    <p className="panel-description">Static examples, not live operational logs.</p>
                  </div>
                  <span className="badge badge-neutral">sample data</span>
                </div>
                <LogStream />
              </section>
            )}

            {view === "security" && (
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2><ShieldAlert size={18} aria-hidden="true" /> Security verification</h2>
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
              </section>
            )}

            {view === "settings" && (
              <section className="panel">
                <div className="panel-head"><h2><Settings size={18} aria-hidden="true" /> Workspace settings</h2></div>
                <p className="muted">Provider configuration is not connected in this frontend-only phase. No credentials are requested or stored here.</p>
              </section>
            )}
          </main>
        </div>
      </div>
    </>
  );
}
