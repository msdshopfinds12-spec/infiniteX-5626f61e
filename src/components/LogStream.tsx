interface LogLine { time: string; level: "info" | "warn" | "error"; source: string; message: string; }
const sampleLogs: LogLine[] = [
  { time: "06:41:02", level: "info", source: "atlas", message: "Sample plan generated: 6 steps, 2 agents" },
  { time: "06:41:05", level: "info", source: "forge", message: "Sample generated 4 files for auth-service" },
  { time: "06:41:09", level: "warn", source: "vault", message: "Sample dependency flagged for review" },
  { time: "06:41:12", level: "info", source: "billing-api", message: "Sample deploy stage started" },
  { time: "06:41:18", level: "error", source: "pulse", message: "Sample health probe timed out" },
  { time: "06:41:22", level: "info", source: "sentinel", message: "Sample diff queued for review" },
  { time: "06:41:26", level: "info", source: "forge", message: "Illustrative test result: 142 passed, 0 failed" },
];
const levelClass: Record<LogLine["level"], string> = { info: "log-info", warn: "log-warn", error: "log-error" };

export default function LogStream({ compact = false, searchTerm = "" }: { compact?: boolean; searchTerm?: string }) {
  const query = searchTerm.trim().toLocaleLowerCase();
  const filtered = sampleLogs.filter((line) => [line.time, line.level, line.source, line.message].some((value) => value.toLocaleLowerCase().includes(query)));
  const lines = compact ? filtered.slice(0, 5) : filtered;
  if (lines.length === 0) return <p className="empty-state">No sample log records match "{searchTerm}".</p>;
  return <div className="log-stream" aria-label="Static sample log records">
    {lines.map((line) => <div key={line.time + "-" + line.source} className="log-line">
      <span className="log-time">{line.time}</span><span className={"log-level " + levelClass[line.level]}>{line.level}</span><span className="log-source">{line.source}</span><span className="log-message">{line.message}</span>
    </div>)}
  </div>;
}
