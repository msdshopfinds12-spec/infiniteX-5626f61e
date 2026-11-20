import { Dot } from "lucide-react";

interface Agent {
  id: string;
  name: string;
  role: string;
  status: "running" | "idle" | "error";
  task: string;
}

const sampleAgents: Agent[] = [
  { id: "a1", name: "Atlas", role: "Planner", status: "running", task: "Demo: decomposing feature spec" },
  { id: "a2", name: "Forge", role: "Codegen", status: "running", task: "Demo: writing API endpoints" },
  { id: "a3", name: "Sentinel", role: "Reviewer", status: "idle", task: "Demo: awaiting next diff" },
  { id: "a4", name: "Vault", role: "Security", status: "running", task: "Demo: scanning dependencies" },
  { id: "a5", name: "Pulse", role: "Monitor", status: "error", task: "Demo: sample timeout state" },
  { id: "a6", name: "Quill", role: "Docs", status: "idle", task: "Demo: queued for release notes" },
];

const statusClass: Record<Agent["status"], string> = {
  running: "status-running",
  idle: "status-idle",
  error: "status-error",
};

export default function AgentList({ compact = false, searchTerm = "" }: { compact?: boolean; searchTerm?: string }) {
  const query = searchTerm.trim().toLocaleLowerCase();
  const filtered = sampleAgents.filter((agent) =>
    [agent.name, agent.role, agent.status, agent.task].some((value) => value.toLocaleLowerCase().includes(query))
  );
  const visible = compact ? filtered.slice(0, 4) : filtered;

  if (visible.length === 0) {
    return <p className="empty-state" role="status">No sample agents match "{searchTerm}".</p>;
  }

  return (
    <ul className="agent-list" aria-label="Demo agent records">
      {visible.map((agent) => (
        <li key={agent.id} className="agent-row">
          <div className="agent-id">
            <span className={"agent-dot " + statusClass[agent.status]} aria-hidden="true"><Dot size={18} /></span>
            <div>
              <div className="agent-name">{agent.name}</div>
              <div className="agent-role">{agent.role}</div>
            </div>
          </div>
          <div className="agent-task">
            <span className={"status-pill " + statusClass[agent.status]}>{agent.status}</span>
            <span className="agent-task-text">{agent.task}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
