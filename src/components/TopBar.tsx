import { Moon, Search, Sun } from "lucide-react";
import type { Theme } from "../hooks/useTheme";

export default function TopBar({
  title,
  theme,
  onToggleTheme,
  searchValue,
  onSearchChange,
}: {
  title: string;
  theme: Theme;
  onToggleTheme: () => void;
  searchValue: string;
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
            type="search"
            aria-label="Search sample agents"
            placeholder="Search sample agents..."
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
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
