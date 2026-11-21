import { Bot, CircleOff, ShieldCheck, Activity } from "lucide-react";

export default function AgentList() {
  return (
    <section className="runtime-registry" aria-label="AI runtime capability status">
      <div className="runtime-registry-intro">
        <div className="runtime-registry-mark" aria-hidden="true"><Bot size={24} /></div>
        <div>
          <h3>AI runtime is not active</h3>
          <p>The secure server-side request boundary is implemented and CI-verified. A production model provider has not been configured or approved.</p>
        </div>
      </div>

      <div className="runtime-status-grid">
        <article className="runtime-status-card">
          <span className="runtime-status-icon"><ShieldCheck size={17} /></span>
          <span className="runtime-status-label">Server boundary</span>
          <strong>CI verified</strong>
          <span className="runtime-status-detail">Repository checks passed</span>
        </article>
        <article className="runtime-status-card">
          <span className="runtime-status-icon"><CircleOff size={17} /></span>
          <span className="runtime-status-label">Model provider</span>
          <strong>Disabled</strong>
          <span className="runtime-status-detail">No provider key or endpoint configured</span>
        </article>
        <article className="runtime-status-card">
          <span className="runtime-status-icon"><Bot size={17} /></span>
          <span className="runtime-status-label">Agent registry</span>
          <strong>Not connected</strong>
          <span className="runtime-status-detail">No live agent registrations available</span>
        </article>
        <article className="runtime-status-card">
          <span className="runtime-status-icon"><Activity size={17} /></span>
          <span className="runtime-status-label">Execution telemetry</span>
          <strong>Not measured</strong>
          <span className="runtime-status-detail">No live model executions to report</span>
        </article>
      </div>

      <p className="runtime-registry-note" role="note">
        No sample agents or simulated running states are displayed. Provider activation requires a separately reviewed cost, privacy, quota and deployment plan.
      </p>
    </section>
  );
}
