import type { LucideIcon } from "lucide-react";

export type ViewKey =
  | "overview"
  | "agents"
  | "pipelines"
  | "logs"
  | "security"
  | "settings";

export type Accent = "primary" | "success" | "warning" | "error" | "neutral";
export type Trend = "up" | "down" | "flat";

export interface Metric {
  id: string;
  label: string;
  value: string;
  delta: string;
  trend: Trend;
  icon: LucideIcon;
  accent: Accent;
}
