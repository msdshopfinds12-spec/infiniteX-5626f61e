import { Minus, type LucideIcon } from "lucide-react";
import type { Accent, Trend } from "../types";

const accentClass: Record<Accent, string> = {
  primary: "accent-primary",
  success: "accent-success",
  warning: "accent-warning",
  error: "accent-error",
  neutral: "accent-neutral",
};

export default function MetricCard({
  label,
  value,
  delta,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  delta: string;
  trend: Trend;
  icon: LucideIcon;
  accent: Accent;
}) {
  return (
    <article className={"metric " + accentClass[accent]} aria-label={label + ": " + value}>
      <div className="metric-top">
        <span className="metric-label">{label}</span>
        <span className="metric-icon"><Icon size={18} aria-hidden="true" /></span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-delta trend-flat">
        <Minus size={14} aria-hidden="true" />
        <span>{delta}</span>
      </div>
    </article>
  );
}
