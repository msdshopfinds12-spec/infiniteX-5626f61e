import { useMemo, useState } from "react";
import { Activity, Bot, Cpu, GitBranch, Play, Settings, ShieldAlert, Terminal, Zap } from "lucide-react";
import { Analytics } from "@vercel/analytics/react";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import { useTheme } from "./hooks/useTheme";
import MetricCard from "./components/MetricCard";
import AgentList from "./components/AgentList";
import PipelineBoard from "./components/PipelineBoard";
import LogStream from "./components/LogStream";
import type { ViewKey } from "./types";

const securityChecks = ["Database Row Level Security policies", "Client-side secret exposure", "Edge Function CORS allowlist", "Secret storage and rotation", "Authorization on protected mutations"];

export default function App() {
  const [view, setView] = useState<ViewKey>("overview");
  const [searchTerm, setSearchTerm] = useState("");
  const [draftCreated, setDraftCreated] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const query = searchTerm.trim().toLocaleLowerCase();
  const metrics = useMemo(() => [
    { id: "agents", label: "Agent registry", value: "6 demo records", delta: "Not connected", trend: "flat" as const, icon: Bot, accent: "primary" as const },
    { id: "pipelines", label: "Pipeline samples", value: "3 demo records", delta: "Local preview only", trend: "flat" as const, icon: GitBranch, accent: "neutral" as const },
    { id: "logs", label: "Log samples", value: "7 demo records", delta: "Not streaming", trend: "flat" as const, icon: Terminal, accent: "warning" as const },
    { id: "runtime", label: "Backend status", value: "Not connected", delta: "Integration pending", trend: "flat" as const, icon: Activity, accent: "error" as const },
  ], []);
  const titles: Record<ViewKey, string> = { overview: "Overview", agents: "AI Agents", pipelines: "Pipelines", logs: "Log Stream", security: "Security Posture", settings: "Settings" };

  return (
    <>
      <div className="app-shell">
        <Sidebar view={view} onChange={(next) => { setView(next); setSearchTerm(""); }} />
        <div className="main">
          <TopBar title={titles[view]} theme={theme} onToggleTheme={toggleTheme} searchTerm={searchTerm} onSearchChange={setSearchTerm} />
          <main className="content">
            <div className="environment-banner" role="status"><span className="environment-dot" /><strong>DEMO MODE</strong><span>Sample data only. No live agents, pipelines, logs, or backend connection verified.</span></div>
            {view === "overview" && <>
              <section className="metrics" aria-label="Demo metrics">{metrics.map((metric) => <MetricCard key={metric.id} {...metric} />)}</section>
              <section className="grid-2">
                <div className="panel"><div className="panel-head"><h2><Cpu size={18} /> Agent registry</h2><span className="badge badge-neutral">DEMO</span></div><AgentList compact searchTerm={query} /></div>
                <div className="panel"><div className="panel-head"><h2><Terminal size={18} /> Sample log records</h2><span className="badge badge-neutral">STATIC</span></div><LogStream compact searchTerm={query} /></div>
              </section>
              <section className="panel"><div className="panel-head"><h2><GitBranch size={18} /> Pipeline samples</h2><button className="btn btn-ghost" disabled title="A pipeline execution provider is not connected"><Play size={14} /> Run all unavailable</button></div><p className="notice-text">Execution is disabled until a verified CI/CD provider and authorization flow are configured.</p><PipelineBoard searchTerm={query} /></section>
            </>}
            {view === "agents" && <div className="panel"><div className="panel-head"><h2><Bot size={18} /> Registered agent examples</h2><span className="badge badge-neutral">LOCAL DATA</span></div><AgentList searchTerm={query} /></div>}
            {view === "pipelines" && <div className="panel"><div className="panel-head"><h2><GitBranch size={18} /> Pipeline workspace</h2><button className="btn btn-primary" onClick={() => setDraftCreated(true)} disabled={draftCreated}><Zap size={14} /> {draftCreated ? "Draft created locally" : "Create local draft"}</button></div><p className="notice-text">This draft exists only in this browser session. It does not create a GitHub workflow or trigger a deployment.</p><PipelineBoard expanded searchTerm={query} includeDraft={draftCreated} /></div>}
            {view === "logs" && <div className="panel"><div className="panel-head"><h2><Terminal size={18} /> Sample log records</h2><span className="badge badge-neutral">NOT LIVE</span></div><LogStream searchTerm={query} /></div>}
            {view === "security" && <div className="panel"><div className="panel-head"><h2><ShieldAlert size={18} /> Security verification checklist</h2><span className="badge badge-warning">NOT AUDITED</span></div><p className="notice-text">These controls have not been verified against a connected production environment. No security pass is being claimed.</p><ul className="checklist">{securityChecks.map((item) => <li key={item}><span className="verification-pending" aria-hidden="true">?</span><span>{item}</span><span className="verification-label">Not verified</span></li>)}</ul></div>}
            {view === "settings" && <div className="panel"><div className="panel-head"><h2><Settings size={18} /> Workspace settings</h2><span className="badge badge-neutral">LOCAL</span></div><p className="muted">Provider connections, runtime limits, authentication, and deployment targets are not configured in this frontend phase.</p><div className="settings-summary"><div><strong>AI model provider</strong><span>Not connected</span></div><div><strong>Backend API</strong><span>Not connected</span></div><div><strong>Deployment provider</strong><span>Not verified</span></div></div></div>}
          </main>
        </div>
      </div>
      <Analytics />
    </>
  );
}
