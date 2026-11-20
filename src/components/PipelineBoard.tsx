import { GitBranch } from "lucide-react";
interface Stage { name: string; status: "passed" | "running" | "queued" | "failed"; }
interface Pipeline { id: string; name: string; branch: string; stages: Stage[]; }
const samplePipelines: Pipeline[] = [
  { id: "p1", name: "auth-service", branch: "main", stages: [{ name: "Lint", status: "passed" }, { name: "Build", status: "passed" }, { name: "Test", status: "running" }, { name: "Deploy", status: "queued" }] },
  { id: "p2", name: "billing-api", branch: "release/2.4", stages: [{ name: "Lint", status: "passed" }, { name: "Build", status: "passed" }, { name: "Test", status: "passed" }, { name: "Deploy", status: "running" }] },
  { id: "p3", name: "web-dashboard", branch: "feat/insights", stages: [{ name: "Lint", status: "passed" }, { name: "Build", status: "failed" }, { name: "Test", status: "queued" }, { name: "Deploy", status: "queued" }] },
];
const stageClass: Record<Stage["status"], string> = { passed: "stage-passed", running: "stage-running", queued: "stage-queued", failed: "stage-failed" };

export default function PipelineBoard({ expanded = false, searchTerm = "", includeDraft = false }: { expanded?: boolean; searchTerm?: string; includeDraft?: boolean }) {
  const pipelines = includeDraft ? [...samplePipelines, { id: "local-draft", name: "new-local-draft", branch: "local-only", stages: [{ name: "Plan", status: "queued" as const }, { name: "Build", status: "queued" as const }, { name: "Test", status: "queued" as const }, { name: "Deploy", status: "queued" as const }] }] : samplePipelines;
  const query = searchTerm.trim().toLocaleLowerCase();
  const filtered = pipelines.filter((pipeline) => [pipeline.name, pipeline.branch, ...pipeline.stages.map((stage) => stage.name), ...pipeline.stages.map((stage) => stage.status)].some((value) => value.toLocaleLowerCase().includes(query)));
  if (filtered.length === 0) return <p className="empty-state">No sample pipelines match "{searchTerm}".</p>;
  return <div className="pipeline-board" aria-label="Sample pipeline records">
    {filtered.map((pipeline) => <div key={pipeline.id} className="pipeline-row">
      <div className="pipeline-meta"><GitBranch size={16} /><span className="pipeline-name">{pipeline.name}</span><span className="pipeline-branch">{pipeline.branch}</span></div>
      <div className={"pipeline-stages" + (expanded ? " expanded" : "")}>{pipeline.stages.map((stage) => <div key={stage.name} className={"stage " + stageClass[stage.status]}><span className="stage-name">{stage.name}</span><span className="stage-status">{stage.status}</span></div>)}</div>
    </div>)}
  </div>;
}
