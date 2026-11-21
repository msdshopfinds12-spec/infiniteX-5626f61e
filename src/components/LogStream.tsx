import { Terminal, GitBranch } from "lucide-react";

export default function LogStream() {
  return (
    <section className="activity-empty-state" aria-label="Workflow activity availability">
      <div className="activity-empty-icon" aria-hidden="true"><Terminal size={25} /></div>
      <h3>Global event stream is not connected</h3>
      <p>
        InfiniteX does not currently collect a verified global live log stream. No sample timestamps, fabricated events or illustrative test counts are shown here.
      </p>
      <div className="activity-next-step">
        <GitBranch size={17} aria-hidden="true" />
        <div>
          <strong>Inspect real workflow events</strong>
          <span>Open Pipelines, select a workflow, expand a run, then choose Events. Event metadata is loaded through the authenticated workflow read service and database RLS.</span>
        </div>
      </div>
    </section>
  );
}
