import { GitBranch } from "lucide-react";

interface Stage {
  name: string;
  status: "sample";
}

interface Pipeline {
  id: string;
  name: string;
  branch: string;
  stages: Stage[];
}

const pipelines: Pipeline[] = [
  { id: "p1", name: "auth-service", branch: "example/auth", stages: [{ name: "Lint", status: "sample" }, { name: "Build", status: "sample" }, { name: "Test", status: "sample" }, { name: "Deploy", status: "sample" }] },
  { id: "p2", name: "billing-api", branch: "example/billing", stages: [{ name: "Lint", status: "sample" }, { name: "Build", status: "sample" }, { name: "Test", status: "sample" }, { name: "Deploy", status: "sample" }] },
  { id: "p3", name: "web-dashboard", branch: "example/dashboard", stages: [{ name: "Lint", status: "sample" }, { name: "Build", status: "sample" }, { name: "Test", status: "sample" }, { name: "Deploy", status: "sample" }] },
];

export default function PipelineBoard({ expanded = false }: { expanded?: boolean }) {
  return (
    <div className="pipeline-board" aria-label="Illustrative pipeline records">
      {pipelines.map((pipeline) => (
        <div key={pipeline.id} className="pipeline-row">
          <div className="pipeline-meta">
            <GitBranch size={16} />
            <span className="pipeline-name">{pipeline.name}</span>
            <span className="pipeline-branch">{pipeline.branch}</span>
          </div>
          <div className={`pipeline-stages${expanded ? " expanded" : ""}`}>
            {pipeline.stages.map((stage) => (
              <div key={stage.name} className="stage stage-sample">
                <span className="stage-name">{stage.name}</span>
                <span className="stage-status">sample</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
