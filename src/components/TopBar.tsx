import { Moon, Search, Sun } from "lucide-react";
import type { Theme } from "../hooks/useTheme";

export default function TopBar({ title, theme, onToggleTheme, searchTerm, onSearchChange }: {
  title: string;
  theme: Theme;
  onToggleTheme: () => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
}) {
  const isDark = theme === "dark";
  return (
    <header className="topbar">
      <h1 className="topbar-title">{title}</h1>
      <div className="topbar-actions">
        <label className="search">
          <Search size={14} aria-hidden="true" />
          <input
            aria-label="Filter current view"
            type="search"
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Filter current view..."
          />
        </label>
        <button
          className="icon-btn"
          type="button"
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          onClick={onToggleTheme}
        >
          {isDark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
        </button>
      </div>
    </header>
  );
}
