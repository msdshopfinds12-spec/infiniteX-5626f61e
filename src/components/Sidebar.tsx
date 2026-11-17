import {
  Activity, Bot, GitBranch, Layers3, ShieldCheck, Workflow, Zap, type LucideIcon,
} from "lucide-react";
import type { ViewKey } from "../types";

const navigation: { key: ViewKey; label: string; icon: LucideIcon }[] = [
  { key: "overview", label: "Overview", icon: Activity },
  { key: "agents", label: "AI Agents", icon: Bot },
  { key: "pipelines", label: "Workflows", icon: Workflow },
  { key: "activity", label: "Activity", icon: GitBranch },
  { key: "security", label: "Guardrails", icon: ShieldCheck },
  { key: "integrations", label: "Integrations", icon: Layers3 },
];

export default function Sidebar({
  view,
  onChange,
}: {
  view: ViewKey;
  onChange: (nextView: ViewKey) => void;
}) {
  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <a className="brand" href="#main-content" aria-label="InfiniteX home">
        <span className="brand-mark"><Zap size={19} strokeWidth={2.4} /></span>
        <span className="brand-copy"><strong>InfiniteX</strong><small>ENGINEERING OS</small></span>
      </a>
      <div className="nav-caption">WORKSPACE</div>
      <nav className="nav-list">
        {navigation.map((item) => {
          const Icon = item.icon;
          const active = view === item.key;
          return (
            <button
              key={item.key}
              type="button"
              className={active ? "nav-item active" : "nav-item"}
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              title={item.label}
              onClick={() => onChange(item.key)}
            >
              <Icon size={18} />
              <span>{item.label}</span>
              {active && <i className="nav-active-mark" aria-hidden="true" />}
            </button>
          );
        })}
      </nav>
      <div className="sidebar-bottom">
        <div className="workspace-chip">
          <span className="workspace-avatar">IX</span>
          <span><strong>Local workspace</strong><small>Demo environment</small></span>
        </div>
        <div className="sidebar-footnote">No remote actions enabled</div>
      </div>
    </aside>
  );
}
