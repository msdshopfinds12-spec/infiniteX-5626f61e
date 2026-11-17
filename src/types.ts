import type { LucideIcon } from "lucide-react";

export type ViewKey = "overview" | "agents" | "pipelines" | "activity" | "security" | "integrations";
export type Theme = "dark" | "light";
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

export interface LogEntry {
  id: string;
  time: string;
  level: "info" | "warn" | "error";
  source: string;
  message: string;
}

export interface PipelineStage {
  name: string;
  status: "demo" | "planned" | "blocked";
}

export interface Pipeline {
  id: string;
  name: string;
  branch: string;
  stages: PipelineStage[];
}
