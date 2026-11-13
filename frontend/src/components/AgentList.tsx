import { Dot } from "lucide-react";

interface Agent {
  id: string;
  name: string;
  role: string;
  status: "running" | "idle" | "error";
  task: string;
}

const agents: Agent[] = [
  { id: "a1", name: "Atlas", role: "Planner", status: "running", task: "Decomposing feature spec" },
  { id: "a2", name: "Forge", role: "Codegen", status: "running", task: "Writing API endpoints" },
  { id: "a3", name: "Sentinel", role: "Reviewer", status: "idle", task: "Awaiting next diff" },
  { id: "a4", name: "Vault", role: "Security", status: "running", task: "Scanning dependencies" },
  { id: "a5", name: "Pulse", role: "Monitor", status: "error", task: "Retrying after timeout" },
  { id: "a6", name: "Quill", role: "Docs", status: "idle", task: "Queued for release notes" },
];

const statusClass: Record<Agent["status"], string> = {
  running: "status-running",
  idle: "status-idle",
  error: "status-error",
};

export default function AgentList({ compact = false }: { compact?: boolean }) {
  const list = compact ? agents.slice(0, 4) : agents;
  return (
    <ul className="agent-list">
      {list.map((a) => (
        <li key={a.id} className="agent-row">
          <div className="agent-id">
            <span className={`agent-dot ${statusClass[a.status]}`}>
              <Dot size={18} />
            </span>
            <div>
              <div className="agent-name">{a.name}</div>
              <div className="agent-role">{a.role}</div>
            </div>
          </div>
          <div className="agent-task">
            <span className={`status-pill ${statusClass[a.status]}`}>{a.status}</span>
            <span className="agent-task-text">{a.task}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
