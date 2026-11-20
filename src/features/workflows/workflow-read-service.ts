import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "../../lib/supabase/database.types.ts";

export type WorkflowListItem = Pick<
  Tables<"workflows">,
  "id" | "name" | "description" | "status" | "trigger_type" | "created_at" | "updated_at"
>;

export type WorkflowReadResult =
  | Readonly<{ status: "success"; data: readonly WorkflowListItem[] }>
  | Readonly<{ status: "error"; code: "invalid_limit" | "query_failed" | "network_unavailable" }>;

export type WorkflowReadService = Readonly<{
  listOwnWorkflows: (options?: Readonly<{ limit?: number }>) => Promise<WorkflowReadResult>;
}>;

const WORKFLOW_LIST_COLUMNS =
  "id,name,description,status,trigger_type,created_at,updated_at" as const;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * Read-only browser service for the signed-in user's workflows.
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
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
        return { status: "error", code: "invalid_limit" } as const;
      }

      try {
        const { data, error } = await client
          .from("workflows")
          .select(WORKFLOW_LIST_COLUMNS)
          .order("updated_at", { ascending: false })
          .limit(limit);

        if (error) return { status: "error", code: "query_failed" } as const;

        return {
          status: "success",
          data: (data ?? []) as WorkflowListItem[],
        } as const;
      } catch {
        return { status: "error", code: "network_unavailable" } as const;
      }
    },
  });
}
