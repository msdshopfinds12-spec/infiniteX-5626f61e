import { Terminal } from "lucide-react";
import type { LogEntry } from "../types";

export const demoLogEntries: LogEntry[] = [
  { id: "log-1", time: "09:00:01", level: "info", source: "control-plane", message: "Local demo workspace initialized." },
  { id: "log-2", time: "09:00:03", level: "warn", source: "agent-registry", message: "Candidate adapters are listed as NOT CONNECTED." },
  { id: "log-3", time: "09:00:05", level: "info", source: "policy-engine", message: "Remote execution remains disabled." },
];

export default function LogStream({
  entries,
  compact = false,
}: {
  entries: LogEntry[];
  compact?: boolean;
}) {
  const visible = compact ? entries.slice(0, 5) : entries;
  if (visible.length === 0) {
    return <div className="empty-state">No activity matches this search.</div>;
  }

  return (
    <div className="log-panel">
      <div className="log-panel-label"><Terminal size={14} /> LOCAL DEMO EVENTS</div>
      <div className="log-list" role="log" aria-label="Local demo activity">
        {visible.map((entry) => (
          <div className="log-entry" key={entry.id}>
            <time>{entry.time}</time>
            <span className={"log-level level-" + entry.level}>{entry.level}</span>
            <span className="log-source">{entry.source}</span>
            <p>{entry.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
