interface LogLine {
  level: "info" | "warn" | "error";
  source: string;
  message: string;
}

const logs: LogLine[] = [
  { level: "info", source: "atlas", message: "Illustrative planning event" },
  { level: "info", source: "forge", message: "Illustrative code generation event" },
  { level: "warn", source: "vault", message: "Example dependency review notice" },
  { level: "info", source: "pipeline", message: "Example pipeline event — not executed" },
  { level: "error", source: "monitor", message: "Example error record — not a live alert" },
];

const levelClass: Record<LogLine["level"], string> = {
  info: "log-info",
  warn: "log-warn",
  error: "log-error",
};

export default function LogStream({ compact = false }: { compact?: boolean }) {
  const lines = compact ? logs.slice(0, 3) : logs;
  return (
    <div className="log-stream" aria-label="Illustrative log entries">
      {lines.map((line, index) => (
        <div key={`${line.source}-${index}`} className="log-line">
          <span className={`log-level ${levelClass[line.level]}`}>{line.level}</span>
          <span className="log-source">{line.source}</span>
          <span className="log-message">{line.message}</span>
        </div>
      ))}
    </div>
  );
}
