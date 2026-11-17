import { GitBranch, ShieldCheck } from "lucide-react";
import type { Pipeline } from "../types";

export const demoPipelines: Pipeline[] = [
  {
    id: "demo-quality",
    name: "Quality gate preview",
    branch: "local/demo",
    stages: [
      { name: "Inspect", status: "demo" },
      { name: "Type-check", status: "planned" },
      { name: "Test", status: "planned" },
      { name: "Human review", status: "blocked" },
    ],
  },
  {
    id: "demo-ai",
    name: "AI adapter proposal",
    branch: "local/demo",
    stages: [
      { name: "Inventory", status: "demo" },
      { name: "Plan", status: "demo" },
      { name: "Connect", status: "blocked" },
      { name: "Approval", status: "blocked" },
    ],
  },
];

export default function PipelineBoard({
  pipelines,
  expanded = false,
}: {
  pipelines: Pipeline[];
  expanded?: boolean;
}) {
  if (pipelines.length === 0) {
    return <div className="empty-state">No local workflows match this search.</div>;
  }

  return (
    <div className="pipeline-list">
      {pipelines.map((pipeline) => (
        <article className="pipeline-card" key={pipeline.id}>
          <div className="pipeline-header">
            <div className="pipeline-identity">
              <span className="pipeline-icon"><GitBranch size={16} /></span>
              <div><strong>{pipeline.name}</strong><small>{pipeline.branch}</small></div>
            </div>
            <span className="state-pill state-demo">LOCAL DEMO</span>
          </div>
          <div className={expanded ? "pipeline-stages expanded" : "pipeline-stages"}>
            {pipeline.stages.map((stage) => (
              <div className={"pipeline-stage stage-" + stage.status} key={stage.name}>
                <span className="stage-marker" />
                <span>{stage.name}</span>
                <small>{stage.status === "blocked" ? "approval needed" : stage.status}</small>
              </div>
            ))}
          </div>
          <div className="pipeline-note"><ShieldCheck size={14} /> No repository, deployment, or provider action is performed.</div>
        </article>
      ))}
    </div>
  );
}
