import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../lib/supabase/database.types.ts";
import type { WorkflowRunRequest } from "./workflow-run-request.ts";

export type WorkflowRunEnqueueResult =
  | Readonly<{
      status: "success";
      run: Readonly<{ id: string; status: "queued"; created_at: string; replayed: boolean }>;
    }>
  | Readonly<{ status: "error"; code: "invalid_request" | "request_failed" | "invalid_response" }>;

export type WorkflowRunService = Readonly<{
  enqueue: (
    request: WorkflowRunRequest,
    requestId: string,
  ) => Promise<WorkflowRunEnqueueResult>;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Browser adapter only invokes the authenticated enqueue Edge Function; it never writes tables directly. */
export function createWorkflowRunService(
  client: Pick<SupabaseClient<Database>, "functions">,
): WorkflowRunService {
  return Object.freeze({
    async enqueue(request, requestId) {
      if (!request || !UUID_PATTERN.test(request.workflow_id) || !UUID_PATTERN.test(requestId)) {
        return { status: "error", code: "invalid_request" } as const;
      }

      try {
        const { data, error } = await client.functions.invoke<unknown>(
          "simula-workflow-run-request",
          {
            body: {
              workflow_id: request.workflow_id,
              request_id: requestId,
              input: request.input as Json,
            },
          },
        );
        if (error) return { status: "error", code: "request_failed" } as const;
        if (!data || typeof data !== "object" || Array.isArray(data)) {
          return { status: "error", code: "invalid_response" } as const;
        }
        const payload = data as Record<string, unknown>;
        const run = payload.run;
        if (payload.ok !== true || !run || typeof run !== "object" || Array.isArray(run)) {
          return { status: "error", code: "invalid_response" } as const;
        }
        const result = run as Record<string, unknown>;
        if (
          result.id !== requestId ||
          result.status !== "queued" ||
          typeof result.created_at !== "string" ||
          typeof result.replayed !== "boolean"
        ) {
          return { status: "error", code: "invalid_response" } as const;
        }
        return {
          status: "success",
          run: {
            id: result.id,
            status: "queued",
            created_at: result.created_at,
            replayed: result.replayed,
          },
        } as const;
      } catch {
        return { status: "error", code: "request_failed" } as const;
      }
    },
  });
}
