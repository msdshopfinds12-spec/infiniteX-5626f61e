import { Dot } from "lucide-react";
import { filterAgents } from "../lib/dashboard-data";

interface Agent {
  id: string;
  name: string;
  role: string;
  status: "sample";
  task: string;
}

const agents: Agent[] = [
  { id: "a1", name: "Atlas", role: "Planner", status: "sample", task: "Example planning task" },
  { id: "a2", name: "Forge", role: "Codegen", status: "sample", task: "Example code generation task" },
  { id: "a3", name: "Sentinel", role: "Reviewer", status: "sample", task: "Example review task" },
  { id: "a4", name: "Vault", role: "Security", status: "sample", task: "Example security review task" },
  { id: "a5", name: "Pulse", role: "Monitor", status: "sample", task: "Example monitoring task" },
  { id: "a6", name: "Quill", role: "Docs", status: "sample", task: "Example documentation task" },
];

export default function AgentList({ compact = false, searchTerm = "" }: { compact?: boolean; searchTerm?: string }) {
  const visibleAgents = filterAgents(agents, searchTerm);
  const list = compact ? visibleAgents.slice(0, 4) : visibleAgents;

  if (list.length === 0) {
    return <p className="empty-state" role="status">No sample agents match “{searchTerm}”.</p>;
  }

  return (
    <ul className="agent-list" aria-label="Sample agent records">
      {list.map((agent) => (
        <li key={agent.id} className="agent-row">
          <div className="agent-id">
            <span className="agent-dot status-sample"><Dot size={18} /></span>
            <div>
              <div className="agent-name">{agent.name}</div>
              <div className="agent-role">{agent.role}</div>
            </div>
          </div>
          <div className="agent-task">
            <span className="status-pill status-sample">sample</span>
            <span className="agent-task-text">{agent.task}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
