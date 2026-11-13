import { useMemo, useState } from "react";
import { Activity, Bot, CircleCheck as CheckCircle2, Cpu, GitBranch, Play, Search, Settings, ShieldCheck, Terminal, Zap } from "lucide-react";
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
        label: "Active Agents",
        value: "12",
        delta: "+3",
        trend: "up" as const,
        icon: Bot,
        accent: "primary" as const,
      },
      {
        id: "runs",
        label: "Pipelines / 24h",
        value: "1,284",
        delta: "+18%",
        trend: "up" as const,
        icon: GitBranch,
        accent: "success" as const,
      },
      {
        id: "tokens",
        label: "Tokens Used",
        value: "4.6M",
        delta: "+0.9M",
        trend: "up" as const,
        icon: Zap,
        accent: "warning" as const,
      },
      {
        id: "uptime",
        label: "System Uptime",
        value: "99.98%",
        delta: "stable",
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
                      <Cpu size={18} /> Live Agent Activity
                    </h2>
                    <span className="badge badge-success">online</span>
                  </div>
                  <AgentList compact />
                </div>
                <div className="panel">
                  <div className="panel-head">
                    <h2>
                      <Terminal size={18} /> System Log Stream
                    </h2>
                    <span className="badge badge-neutral">tailing</span>
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
                  <Terminal size={18} /> Real-time Log Stream
                </h2>
                <span className="badge badge-success">live</span>
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
                <span className="badge badge-success">healthy</span>
              </div>
              <ul className="checklist">
                {[
                  "Row Level Security enabled on all tables",
                  "Service role key never exposed to the client",
                  "Edge functions enforce CORS allowlist",
                  "Secrets stored in vault, not in source",
                  "Auth gates enforced on every mutation",
                ].map((item) => (
                  <li key={item}>
                    <CheckCircle2 size={16} className="check-icon" />
                    {item}
                  </li>
                ))}
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
