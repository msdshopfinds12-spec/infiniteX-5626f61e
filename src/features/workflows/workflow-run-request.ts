import type { Json } from "../../lib/supabase/database.types";

/**
 * Untrusted browser intent for requesting a workflow run.
 *
 * This is deliberately not a database Insert type. The browser must call a
 * separately reviewed server-side operation; the server derives owner_id and
 * enforces queued initial state and worker-owned lifecycle fields.
 */
export type WorkflowRunRequest = Readonly<{
  workflow_id: string;
  input: Json;
}>;

export function createWorkflowRunRequest(
  workflowId: string,
  input: Json = {},
): WorkflowRunRequest {
  const normalizedWorkflowId = workflowId.trim();
  if (!normalizedWorkflowId) {
    throw new TypeError("workflow_id must be a non-empty string");
  }

  return Object.freeze({
    workflow_id: normalizedWorkflowId,
    input,
  });
}
