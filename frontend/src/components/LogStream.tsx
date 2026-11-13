interface LogLine {
  time: string;
  level: "info" | "warn" | "error";
  source: string;
  message: string;
}

const logs: LogLine[] = [
  { time: "06:41:02", level: "info", source: "atlas", message: "Plan generated: 6 steps, 2 agents" },
  { time: "06:41:05", level: "info", source: "forge", message: "Generated 4 files for auth-service" },
  { time: "06:41:09", level: "warn", source: "vault", message: "Dependency 'legacy-crypto' flagged for review" },
  { time: "06:41:12", level: "info", source: "billing-api", message: "Deploy stage started" },
  { time: "06:41:18", level: "error", source: "pulse", message: "Health probe timed out, retrying (2/3)" },
  { time: "06:41:22", level: "info", source: "sentinel", message: "Diff queued, awaiting review slot" },
  { time: "06:41:26", level: "info", source: "forge", message: "Tests: 142 passed, 0 failed" },
];

const levelClass: Record<LogLine["level"], string> = {
  info: "log-info",
  warn: "log-warn",
  error: "log-error",
};

export default function LogStream({ compact = false }: { compact?: boolean }) {
  const lines = compact ? logs.slice(0, 5) : logs;
  return (
    <div className="log-stream">
      {lines.map((l, i) => (
        <div key={i} className="log-line">
          <span className="log-time">{l.time}</span>
          <span className={`log-level ${levelClass[l.level]}`}>{l.level}</span>
          <span className="log-source">{l.source}</span>
          <span className="log-message">{l.message}</span>
        </div>
      ))}
    </div>
  );
}
