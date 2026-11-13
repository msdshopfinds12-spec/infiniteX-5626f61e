import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
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
  trend,
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
  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  const trendClass = trend === "up" ? "trend-up" : trend === "down" ? "trend-down" : "trend-flat";
  return (
    <div className={`metric ${accentClass[accent]}`}>
      <div className="metric-top">
        <span className="metric-label">{label}</span>
        <span className="metric-icon">
          <Icon size={18} />
        </span>
      </div>
      <div className="metric-value">{value}</div>
      <div className={`metric-delta ${trendClass}`}>
        <TrendIcon size={14} />
        <span>{delta}</span>
      </div>
    </div>
  );
}
