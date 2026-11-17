import { ArrowUpRight, Bot, LockKeyhole } from "lucide-react";
import { agentIntegrations } from "../lib/agentRegistry";

export default function AgentList({
  compact = false,
  searchTerm = "",
}: {
  compact?: boolean;
  searchTerm?: string;
}) {
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filtered = agentIntegrations.filter((agent) => {
    const searchable = [agent.name, agent.repository, agent.role, agent.purpose].join(" ").toLowerCase();
    return searchable.includes(normalizedSearch);
  });
  const visible = compact ? filtered.slice(0, 4) : filtered;

  if (visible.length === 0) {
    return <div className="empty-state">No candidate adapters match this search.</div>;
  }

  return (
    <div className="agent-grid">
      {visible.map((agent) => (
        <article className="agent-card" key={agent.id}>
          <div className="agent-card-top">
            <span className="agent-icon"><Bot size={18} /></span>
            <span className="state-pill state-muted"><span className="state-dot" /> NOT CONNECTED</span>
          </div>
          <h3>{agent.name}</h3>
          <p className="agent-role">{agent.role}</p>
          <p className="agent-description">{agent.purpose}</p>
          <div className="agent-card-footer">
            <span><LockKeyhole size={13} /> Server-side credentials</span>
            <span className="adapter-link" title={agent.repository}><ArrowUpRight size={14} /></span>
          </div>
          <code className="repo-name">{agent.repository}</code>
        </article>
      ))}
    </div>
  );
}
