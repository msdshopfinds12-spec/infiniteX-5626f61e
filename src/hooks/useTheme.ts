import { useEffect, useState } from "react";
export type Theme = "dark" | "light";
const STORAGE_KEY = "infinite-x-theme";
function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
  return "dark";
}
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Theme remains active for this session even when persistence is blocked.
    }
  }, [theme]);
  return { theme, toggleTheme: () => setTheme((previous) => previous === "dark" ? "light" : "dark") };
}
