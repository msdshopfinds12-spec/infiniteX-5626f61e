import { useEffect, useState } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "bolt-os-theme";
const DEFAULT_THEME: Theme = "dark";

/**
 * Browser storage is an optional persistence layer, never a requirement for
 * rendering the application. Some privacy modes and embedded browsers deny it.
 */
function readStoredTheme(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "dark" || stored === "light" ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function persistTheme(theme: Theme): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Keep the in-memory theme working when browser storage is unavailable.
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
    }

    persistTheme(theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  };

  return { theme, toggleTheme };
}
