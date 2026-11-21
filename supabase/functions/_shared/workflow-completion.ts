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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_POSTGRES_INTEGER = 2_147_483_647;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

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
  // TypeScript types do not validate values arriving across runtime boundaries.
  // Validate the complete envelope before property access or string operations.
  if (
    !isRecord(input) ||
    !isUuid(input.ownerId) ||
    !isUuid(input.runId) ||
    !isUuid(input.stepId) ||
    !Number.isSafeInteger(input.attempt) || input.attempt < 1 || input.attempt > MAX_POSTGRES_INTEGER ||
    !isRecord(input.output) ||
    typeof rpc !== "function"
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

  if (!isRecord(response) || response.error !== null) {
    throw new Error("step_run_finish_failed");
  }

  // The RPC contract is exactly one completion row. Never silently select
  // an arbitrary row from an ambiguous or empty result set.
  const row = Array.isArray(response.data)
    ? response.data.length === 1
      ? response.data[0]
      : null
    : response.data;

  if (!isRecord(row) || !isUuid(row.step_run_id) ||
      !(row.outbox_id === null || isUuid(row.outbox_id)) ||
      typeof row.replayed !== "boolean") {
    throw new Error("step_run_finish_invalid_response");
  }

  return {
    stepRunId: row.step_run_id,
    outboxId: row.outbox_id,
    replayed: row.replayed,
  };
}
