import type { WorkflowReadService } from "../workflows/workflow-read-service.ts";
import type { ProjectReadService } from "../projects/project-read-service.ts";

export type OverviewSnapshot = Readonly<{
  workflowCount: number | null;
  projectCount: number | null;
  workflowError: string | null;
  projectError: string | null;
}>;

type ReadOutcome = Readonly<{ count: number | null; error: string | null }>;

function resolveOutcome(
  result: PromiseSettledResult<
    | Awaited<ReturnType<WorkflowReadService["listOwnWorkflows"]>>
    | Awaited<ReturnType<ProjectReadService["listOwnProjects"]>>
  >,
): ReadOutcome {
  if (result.status === "rejected") {
    return { count: null, error: "request_failed" };
  }
  if (result.value.status === "error") {
    return { count: null, error: result.value.code };
  }
  return { count: result.value.data.length, error: null };
}

/**
 * Reads only the signed-in user's bounded metadata indexes. The Supabase
 * adapters rely on database RLS; no browser-supplied owner filter is used.
 * Each source fails independently so one unavailable table does not hide
 * the other source's verified count.
 */
export async function readOverviewSnapshot(
  workflowService: WorkflowReadService | null,
  projectService: ProjectReadService | null,
): Promise<OverviewSnapshot> {
  const workflowRead = workflowService
    ? workflowService.listOwnWorkflows({ limit: 100 })
    : Promise.resolve({ status: "error", code: "service_unavailable" } as const);
  const projectRead = projectService
    ? projectService.listOwnProjects({ limit: 100 })
    : Promise.resolve({ status: "error", code: "service_unavailable" } as const);

  const [workflowResult, projectResult] = await Promise.allSettled([
    workflowRead,
    projectRead,
  ]);
  const workflows = resolveOutcome(workflowResult);
  const projects = resolveOutcome(projectResult);

  return {
    workflowCount: workflows.count,
    projectCount: projects.count,
    workflowError: workflows.error,
    projectError: projects.error,
  };
}
