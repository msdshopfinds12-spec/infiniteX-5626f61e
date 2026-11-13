import { GitBranch } from "lucide-react";

interface Stage {
  name: string;
  status: "passed" | "running" | "queued" | "failed";
}

interface Pipeline {
  id: string;
  name: string;
  branch: string;
  stages: Stage[];
}

const pipelines: Pipeline[] = [
  {
    id: "p1",
    name: "auth-service",
    branch: "main",
    stages: [
      { name: "Lint", status: "passed" },
      { name: "Build", status: "passed" },
      { name: "Test", status: "running" },
      { name: "Deploy", status: "queued" },
    ],
  },
  {
    id: "p2",
    name: "billing-api",
    branch: "release/2.4",
    stages: [
      { name: "Lint", status: "passed" },
      { name: "Build", status: "passed" },
      { name: "Test", status: "passed" },
      { name: "Deploy", status: "running" },
    ],
  },
  {
    id: "p3",
    name: "web-dashboard",
    branch: "feat/insights",
    stages: [
      { name: "Lint", status: "passed" },
      { name: "Build", status: "failed" },
      { name: "Test", status: "queued" },
      { name: "Deploy", status: "queued" },
    ],
  },
];

const stageClass: Record<Stage["status"], string> = {
  passed: "stage-passed",
  running: "stage-running",
  queued: "stage-queued",
  failed: "stage-failed",
};

export default function PipelineBoard({ expanded = false }: { expanded?: boolean }) {
  return (
    <div className="pipeline-board">
      {pipelines.map((p) => (
        <div key={p.id} className="pipeline-row">
          <div className="pipeline-meta">
            <GitBranch size={16} />
            <span className="pipeline-name">{p.name}</span>
            <span className="pipeline-branch">{p.branch}</span>
          </div>
          <div className={`pipeline-stages${expanded ? " expanded" : ""}`}>
            {p.stages.map((s) => (
              <div key={s.name} className={`stage ${stageClass[s.status]}`}>
                <span className="stage-name">{s.name}</span>
                <span className="stage-status">{s.status}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
