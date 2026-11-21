import { validateWorkflowOutboxEvent, type WorkflowOutboxEvent } from "./workflow-outbox-contract.ts";

export type WorkflowStepCompletionInput = {
  ownerId: string;
  runId: string;
  stepId: string;
  attempt: number;
  output: Record<string, unknown>;
  outboxEvent?: WorkflowOutboxEvent;
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

const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const POSTGRES_INTEGER_MAX = 2_147_483_647;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCanonicalUuid(value: unknown): value is string {
  return typeof value === "string" && CANONICAL_UUID.test(value);
}

/**
 * Shared fail-closed boundary for authenticated and cron workflow workers.
 * The database RPC remains the sole authority for transactional completion.
 */
export async function completeWorkflowStepWithOutbox(
  rpc: CompletionRpc,
  input: WorkflowStepCompletionInput,
): Promise<WorkflowStepCompletionResult> {
  // Runtime validation mirrors PostgreSQL UUID/integer columns.
  if (
    !isRecord(input) ||
    !isCanonicalUuid(input.ownerId) ||
    !isCanonicalUuid(input.runId) ||
    !isCanonicalUuid(input.stepId) ||
    !Number.isSafeInteger(input.attempt) ||
    input.attempt < 1 ||
    input.attempt > POSTGRES_INTEGER_MAX ||
    !isRecord(input.output) ||
    (input.outboxEvent !== undefined && !validateWorkflowOutboxEvent(input.outboxEvent)) ||
    (input.outboxEvent !== undefined && (
      input.outboxEvent.payload.run_id !== input.runId ||
      input.outboxEvent.payload.step_id !== input.stepId ||
      input.outboxEvent.payload.attempt !== input.attempt
    )) ||
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
      p_event_type: input.outboxEvent?.eventType ?? null,
      p_idempotency_key: input.outboxEvent?.idempotencyKey ?? null,
      p_payload: input.outboxEvent?.payload ?? {},
    });
  } catch {
    throw new Error("step_run_finish_failed");
  }

  if (!isRecord(response) || response.error !== null) {
    throw new Error("step_run_finish_failed");
  }

  const row = Array.isArray(response.data)
    ? response.data.length === 1 ? response.data[0] : null
    : response.data;

  // Validate the entire database response contract; do not coerce malformed values.
  if (
    !isRecord(row) ||
    !isCanonicalUuid(row.step_run_id) ||
    !(row.outbox_id === null || isCanonicalUuid(row.outbox_id)) ||
    typeof row.replayed !== "boolean"
  ) {
    throw new Error("workflow_step_attempt_superseded");
  }

  return {
    stepRunId: row.step_run_id,
    outboxId: row.outbox_id,
    replayed: row.replayed,
  };
}
