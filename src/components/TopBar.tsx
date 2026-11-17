import { Bell, Command, Moon, Search, Sun } from "lucide-react";
import type { Theme, ViewKey } from "../types";

const descriptions: Record<ViewKey, string> = {
  overview: "Your engineering command center",
  agents: "Candidate AI systems and their connection state",
  pipelines: "Local workflow simulations and quality gates",
  activity: "Sample activity, clearly marked as demo data",
  security: "Approval boundaries and security policy",
  integrations: "Repository adapters awaiting verification",
};

export default function TopBar({
  title, view, theme, onToggleTheme, searchValue, onSearch, onNotify,
}: {
  title: string;
  view: ViewKey;
  theme: Theme;
  onToggleTheme: () => void;
  searchValue: string;
  onSearch: (value: string) => void;
  onNotify: () => void;
}) {
  return (
    <header className="topbar">
      <div className="topbar-heading">
        <div className="eyebrow">INFINITEX CONTROL PLANE</div>
        <h1>{title}</h1>
        <p>{descriptions[view]}</p>
      </div>
      <div className="topbar-actions">
        <label className="search-box">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={searchValue}
            onChange={(event) => onSearch(event.currentTarget.value)}
            placeholder="Search workspace"
            aria-label="Search workspace"
          />
          <span className="search-shortcut"><Command size={11} /> K</span>
        </label>
        <button className="icon-button" type="button" onClick={onNotify} aria-label="Show notifications" title="Notifications">
          <Bell size={18} />
        </button>
        <button
          className="icon-button"
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          title={theme === "dark" ? "Light theme" : "Dark theme"}
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  );
}
