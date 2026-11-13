import { Activity, Bot, GitBranch, Settings, ShieldCheck, Terminal, Zap, type LucideIcon } from "lucide-react";
import type { ViewKey } from "../types";

const nav: { key: ViewKey; label: string; icon: LucideIcon }[] = [
  { key: "overview", label: "Overview", icon: Activity },
  { key: "agents", label: "AI Agents", icon: Bot },
  { key: "pipelines", label: "Pipelines", icon: GitBranch },
  { key: "logs", label: "Log Stream", icon: Terminal },
  { key: "security", label: "Security", icon: ShieldCheck },
  { key: "settings", label: "Settings", icon: Settings },
];

export default function Sidebar({
  view,
  onChange,
}: {
  view: ViewKey;
  onChange: (v: ViewKey) => void;
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <Zap size={18} />
        </div>
        <div className="brand-text">
          <span className="brand-title">Bolt OS</span>
          <span className="brand-sub">AI Engineering</span>
        </div>
      </div>
      <nav className="nav">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = view === item.key;
          return (
            <button
              key={item.key}
              className={`nav-item${active ? " active" : ""}`}
              onClick={() => onChange(item.key)}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="sidebar-foot">
        <div className="user-chip">
          <div className="avatar">AE</div>
          <div className="user-meta">
            <span className="user-name">AI Engineer</span>
            <span className="user-role">workspace owner</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
