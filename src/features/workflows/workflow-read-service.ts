import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "../../lib/supabase/database.types.ts";

export type WorkflowListItem = Pick<
  Tables<"workflows">,
  "id" | "name" | "description" | "status" | "trigger_type" | "created_at" | "updated_at"
>;

export type WorkflowRunSummary = Pick<
  Tables<"workflow_runs">,
  "id" | "workflow_id" | "status" | "created_at" | "started_at" | "finished_at" | "attempt"
>;

export type WorkflowLogSummary = Pick<
  Tables<"workflow_logs">,
  "id" | "workflow_id" | "run_id" | "level" | "event" | "created_at"
>;

export type WorkflowReadErrorCode =
  | "invalid_limit"
  | "invalid_workflow_id"
  | "invalid_run_id"
  | "query_failed"
  | "network_unavailable";

export type WorkflowReadResult =
  | Readonly<{ status: "success"; data: readonly WorkflowListItem[] }>
  | Readonly<{ status: "error"; code: WorkflowReadErrorCode }>;

export type WorkflowRunReadResult =
  | Readonly<{ status: "success"; data: readonly WorkflowRunSummary[] }>
  | Readonly<{ status: "error"; code: WorkflowReadErrorCode }>;

export type WorkflowLogReadResult =
  | Readonly<{ status: "success"; data: readonly WorkflowLogSummary[] }>
  | Readonly<{ status: "error"; code: WorkflowReadErrorCode }>;

export type WorkflowReadService = Readonly<{
  listOwnWorkflows: (options?: Readonly<{ limit?: number }>) => Promise<WorkflowReadResult>;
  listWorkflowRuns: (
    workflowId: string,
    options?: Readonly<{ limit?: number }>,
  ) => Promise<WorkflowRunReadResult>;
  listRunLogs: (
    runId: string,
    options?: Readonly<{ limit?: number }>,
  ) => Promise<WorkflowLogReadResult>;
}>;

const WORKFLOW_LIST_COLUMNS =
  "id,name,description,status,trigger_type,created_at,updated_at" as const;
const WORKFLOW_RUN_COLUMNS =
  "id,workflow_id,status,created_at,started_at,finished_at,attempt" as const;
const WORKFLOW_LOG_COLUMNS =
  "id,workflow_id,run_id,level,event,created_at" as const;
const DEFAULT_LIMIT = 50;
const DEFAULT_RUN_LIMIT = 10;
const MAX_LIMIT = 100;

function validLimit(limit: number): boolean {
  return Number.isSafeInteger(limit) && limit >= 1 && limit <= MAX_LIMIT;
}

/**
 * Read-only browser service for the signed-in user's workflows and run history.
 *
 * No owner ID is accepted or selected. PostgreSQL RLS is the authorization
 * boundary; this service must never be treated as a substitute for RLS.
 */
export function createWorkflowReadService(
  client: Pick<SupabaseClient<Database>, "from">,
): WorkflowReadService {
  return Object.freeze({
    async listOwnWorkflows(options = {}) {
      const limit = options.limit ?? DEFAULT_LIMIT;
      if (!validLimit(limit)) return { status: "error", code: "invalid_limit" } as const;

      try {
        const { data, error } = await client
          .from("workflows")
          .select(WORKFLOW_LIST_COLUMNS)
          .order("updated_at", { ascending: false })
          .limit(limit);

        if (error) return { status: "error", code: "query_failed" } as const;
        return { status: "success", data: (data ?? []) as WorkflowListItem[] } as const;
      } catch {
        return { status: "error", code: "network_unavailable" } as const;
      }
    },

    async listWorkflowRuns(workflowId, options = {}) {
      const normalizedWorkflowId = workflowId.trim();
      if (!normalizedWorkflowId) {
        return { status: "error", code: "invalid_workflow_id" } as const;
      }
      const limit = options.limit ?? DEFAULT_RUN_LIMIT;
      if (!validLimit(limit)) return { status: "error", code: "invalid_limit" } as const;

      try {
        const { data, error } = await client
          .from("workflow_runs")
          .select(WORKFLOW_RUN_COLUMNS)
          .eq("workflow_id", normalizedWorkflowId)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (error) return { status: "error", code: "query_failed" } as const;
        return { status: "success", data: (data ?? []) as WorkflowRunSummary[] } as const;
      } catch {
        return { status: "error", code: "network_unavailable" } as const;
      }
    },

    async listRunLogs(runId, options = {}) {
      const normalizedRunId = runId.trim();
      if (!normalizedRunId) {
        return { status: "error", code: "invalid_run_id" } as const;
      }
      const limit = options.limit ?? 50;
      if (!validLimit(limit)) return { status: "error", code: "invalid_limit" } as const;

      try {
        const { data, error } = await client
          .from("workflow_logs")
          .select(WORKFLOW_LOG_COLUMNS)
          .eq("run_id", normalizedRunId)
          .order("created_at", { ascending: true })
          .limit(limit);

        if (error) return { status: "error", code: "query_failed" } as const;
        return { status: "success", data: (data ?? []) as WorkflowLogSummary[] } as const;
      } catch {
        return { status: "error", code: "network_unavailable" } as const;
      }
    },
  });
}
