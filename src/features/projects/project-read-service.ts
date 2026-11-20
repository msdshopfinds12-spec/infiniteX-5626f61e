import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "../../lib/supabase/database.types.ts";

export type OwnProjectSummary = Pick<
  Tables<"user_projects">,
  "id" | "title" | "project_type" | "created_at" | "updated_at"
>;

export type ProjectReadResult =
  | Readonly<{ status: "success"; data: readonly OwnProjectSummary[] }>
  | Readonly<{ status: "error"; code: "invalid_limit" | "query_failed" | "network_unavailable" }>;

export type ProjectReadService = Readonly<{
  listOwnProjects: (options?: Readonly<{ limit?: number }>) => Promise<ProjectReadResult>;
}>;

const PROJECT_COLUMNS = "id,title,project_type,created_at,updated_at" as const;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function validLimit(limit: number): boolean {
  return Number.isSafeInteger(limit) && limit >= 1 && limit <= MAX_LIMIT;
}

/**
 * Read-only project metadata query. PostgreSQL RLS scopes rows to auth.uid().
 * Project JSON content and user_id are intentionally not selected.
 */
export function createProjectReadService(
  client: Pick<SupabaseClient<Database>, "from">,
): ProjectReadService {
  return Object.freeze({
    async listOwnProjects(options = {}) {
      const limit = options.limit ?? DEFAULT_LIMIT;
      if (!validLimit(limit)) return { status: "error", code: "invalid_limit" } as const;

      try {
        const { data, error } = await client
          .from("user_projects")
          .select(PROJECT_COLUMNS)
          .order("updated_at", { ascending: false })
          .limit(limit);

        if (error) return { status: "error", code: "query_failed" } as const;
        return { status: "success", data: data ?? [] } as const;
      } catch {
        return { status: "error", code: "network_unavailable" } as const;
      }
    },
  });
}
