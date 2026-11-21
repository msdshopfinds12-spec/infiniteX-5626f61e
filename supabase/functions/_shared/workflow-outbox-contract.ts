/** Allowlisted, server-generated workflow outbox event contract. No user-controlled routing. */

export type WorkflowStepCompletedEvent = {
  eventType: "workflow.step.completed";
  idempotencyKey: string;
  payload: {
    run_id: string;
    step_id: string;
    attempt: number;
  };
};

export type WorkflowOutboxEvent = WorkflowStepCompletedEvent;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 200;
}

/** Stable key: repeated completion of the same generation maps to the same event. */
export function createWorkflowStepCompletedEvent(input: {
  runId: string;
  stepId: string;
  attempt: number;
}): WorkflowStepCompletedEvent {
  if (!isRecord(input) || !nonEmpty(input.runId) || !nonEmpty(input.stepId) ||
      !Number.isSafeInteger(input.attempt) || input.attempt < 1) {
    throw new Error("workflow_outbox_event_invalid_identity");
  }
  const idempotencyKey = `workflow.step.completed:${input.runId}:${input.stepId}:${input.attempt}`;
  if (idempotencyKey.length > 200) throw new Error("workflow_outbox_idempotency_key_too_long");
  return {
    eventType: "workflow.step.completed",
    idempotencyKey,
    payload: { run_id: input.runId, step_id: input.stepId, attempt: input.attempt },
  };
}

export function validateWorkflowOutboxEvent(value: unknown): value is WorkflowOutboxEvent {
  if (!isRecord(value) || value.eventType !== "workflow.step.completed" ||
      !nonEmpty(value.idempotencyKey) || !isRecord(value.payload)) return false;
  const payload = value.payload;
  if (!nonEmpty(payload.run_id) || !nonEmpty(payload.step_id) ||
      !Number.isSafeInteger(payload.attempt) || (payload.attempt as number) < 1) return false;
  const expected = `workflow.step.completed:${payload.run_id}:${payload.step_id}:${payload.attempt}`;
  return value.idempotencyKey === expected && expected.length <= 200 &&
    Object.keys(payload).every((key) => ["run_id", "step_id", "attempt"].includes(key)) &&
    Object.keys(payload).length === 3;
}
