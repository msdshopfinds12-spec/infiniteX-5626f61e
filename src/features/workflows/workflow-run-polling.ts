import type { WorkflowRunSummary } from "./workflow-read-service.ts";

/** Poll only while the server reports work that may still transition. */
export const WORKFLOW_RUN_POLL_INTERVAL_MS = 5_000;

const ACTIVE_RUN_STATUSES = new Set(["queued", "running"]);

export function hasActiveWorkflowRuns(
  runs: readonly Pick<WorkflowRunSummary, "status">[],
): boolean {
  return runs.some((run) => ACTIVE_RUN_STATUSES.has(run.status));
}
