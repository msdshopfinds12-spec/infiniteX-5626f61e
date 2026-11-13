import { Bell, Moon, Search, Sun } from "lucide-react";
import type { Theme } from "../hooks/useTheme";

export default function TopBar({
  title,
  theme,
  onToggleTheme,
}: {
  title: string;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const isDark = theme === "dark";
  return (
    <header className="topbar">
      <h1 className="topbar-title">{title}</h1>
      <div className="topbar-actions">
        <div className="search">
          <Search size={14} />
          <input placeholder="Search agents, runs, logs..." />
        </div>
        <button
          className="icon-btn"
          aria-label="Notifications"
        >
          <Bell size={18} />
        </button>
        <button
          className="icon-btn"
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          onClick={onToggleTheme}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  );
}
