export type WorkflowOutboxEvent = {
  eventType: "notification.requested";
  payload: { recipient_ref: string; template_key: string };
};

export type WorkflowStepCompletionInput = {
  ownerId: string;
  runId: string;
  stepId: string;
  attempt: number;
  output: Record<string, unknown>;
  event?: WorkflowOutboxEvent | null;
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

  const event = input.event ?? null;
  let eventType: string | null = null;
  let idempotencyKey: string | null = null;
  let eventPayload: Record<string, unknown> = {};

  if (event !== null) {
    const payload = event && isRecord(event.payload) ? event.payload : null;
    const recipientRef = payload?.recipient_ref;
    const templateKey = payload?.template_key;
    if (
      event.eventType !== "notification.requested" ||
      !payload ||
      Object.keys(payload).length !== 2 ||
      !isUuid(recipientRef) || recipientRef !== input.ownerId ||
      typeof templateKey !== "string" ||
      !/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(templateKey)
    ) {
      throw new Error("step_run_finish_invalid_event");
    }
    eventType = "notification.requested";
    // Stable across worker retries for this immutable run/step generation.
    idempotencyKey = `phase90:${input.ownerId}:${input.runId}:${input.stepId}:${input.attempt}:${eventType}`;
    if (idempotencyKey.length > 200) throw new Error("step_run_finish_invalid_event");
    eventPayload = { recipient_ref: recipientRef, template_key: templateKey };
  }

  let response: RpcResponse;
  try {
    response = await rpc("simula_complete_step_with_outbox", {
      p_owner_id: input.ownerId,
      p_run_id: input.runId,
      p_step_id: input.stepId,
      p_attempt: input.attempt,
      p_output: input.output,
      p_event_type: eventType,
      p_idempotency_key: idempotencyKey,
      p_payload: eventPayload,
    });
  } catch {
    throw new Error("step_run_finish_failed");
  }

  if (!isRecord(response) || response.error !== null) {
    throw new Error("step_run_finish_failed");
  }

  // The RPC contract is exactly one completion row. Never silently select
  // an arbitrary row from an ambiguous or empty result set.
  let row: unknown = response.data;
  if (Array.isArray(response.data)) {
    if (response.data.length === 0) {
      throw new Error("workflow_step_attempt_superseded");
    }
    if (response.data.length !== 1) {
      throw new Error("step_run_finish_invalid_response");
    }
    row = response.data[0];
  }

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
