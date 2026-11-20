import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type WorkflowStepTransition = "start" | "succeed" | "fail";

export interface WorkflowStepTransitionInput {
  runId: string;
  stepId: string;
  ownerId: string;
  attempt: number;
  transition: WorkflowStepTransition;
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  errorMessage?: string | null;
}

/**
 * All worker step state changes pass through the database RPC.
 * The RPC locks workflow_runs first, then validates owner/status/generation
 * and changes workflow_step_runs in the same transaction.
 */
export async function transitionWorkflowStep(
  admin: SupabaseClient<any, "public", any, any, any>,
  value: WorkflowStepTransitionInput,
): Promise<string> {
  if (!Number.isInteger(value.attempt) || value.attempt < 1) {
    throw new Error("workflow_step_invalid_attempt");
  }

  const { data, error } = await admin.rpc("simula_transition_workflow_step", {
    p_run_id: value.runId,
    p_step_id: value.stepId,
    p_owner_id: value.ownerId,
    p_attempt: value.attempt,
    p_transition: value.transition,
    p_input: value.input ?? null,
    p_output: value.output ?? null,
    p_error_message: value.errorMessage ?? null,
  });

  if (error) {
    const message = typeof error.message === "string" ? error.message : "";
    if (message.includes("workflow_step_attempt_superseded")) {
      throw new Error("workflow_step_attempt_superseded");
    }
    console.error("workflow_step_transition_rpc_failed", {
      code: error.code ?? "unknown",
      transition: value.transition,
    });
    throw new Error("workflow_step_transition_failed");
  }

  if (typeof data !== "string" || data.length === 0) {
    throw new Error("workflow_step_transition_invalid_response");
  }

  return data;
}
