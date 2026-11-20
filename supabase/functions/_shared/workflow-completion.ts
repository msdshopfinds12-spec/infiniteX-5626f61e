export type WorkflowStepCompletionInput = {
  ownerId: string;
  runId: string;
  stepId: string;
  attempt: number;
  output: Record<string, unknown>;
};

export type WorkflowStepCompletionResult = {
  stepRunId: string;
  outboxId: string | null;
  replayed: boolean;
};

type RpcResponse = { data: unknown; error: unknown | null };
type CompletionRpc = (
  functionName: "simula_complete_step_with_outbox",
  args: Record<string, unknown>,
) => Promise<RpcResponse>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Shared fail-closed boundary for authenticated and cron workflow workers.
 * The database RPC is the sole authority for transactional step completion.
 */
export async function completeWorkflowStepWithOutbox(
  rpc: CompletionRpc,
  input: WorkflowStepCompletionInput,
): Promise<WorkflowStepCompletionResult> {
  if (
    !input.ownerId.trim() || !input.runId.trim() || !input.stepId.trim() ||
    !Number.isSafeInteger(input.attempt) || input.attempt < 1 ||
    !isRecord(input.output)
  ) {
    throw new Error("step_run_finish_invalid_input");
  }

  let response: RpcResponse;
  try {
    response = await rpc("simula_complete_step_with_outbox", {
      p_owner_id: input.ownerId,
      p_run_id: input.runId,
      p_step_id: input.stepId,
      p_attempt: input.attempt,
      p_output: input.output,
      p_event_type: null,
      p_idempotency_key: null,
      p_payload: {},
    });
  } catch {
    throw new Error("step_run_finish_failed");
  }

  if (!isRecord(response) || response.error !== null) throw new Error("step_run_finish_failed");

  const row = Array.isArray(response.data) ? response.data[0] : response.data;
  if (!isRecord(row) || typeof row.step_run_id !== "string" || !row.step_run_id.trim()) {
    throw new Error("workflow_step_attempt_superseded");
  }

  return {
    stepRunId: row.step_run_id,
    outboxId: typeof row.outbox_id === "string" && row.outbox_id.trim() ? row.outbox_id : null,
    replayed: row.replayed === true,
  };
}
