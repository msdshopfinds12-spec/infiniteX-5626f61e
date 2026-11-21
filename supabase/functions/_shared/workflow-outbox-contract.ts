/** Allowlisted, server-generated workflow outbox event contract. No user-controlled routing. */

/**
 * The database RPC stores run_id and step_id as PostgreSQL UUID columns.
 * Enforcing the same canonical representation here prevents delimiter
 * ambiguity and guarantees the generated key remains below the DB limit.
 */
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

const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const POSTGRES_INTEGER_MAX = 2_147_483_647;
const EVENT_PREFIX = "workflow.step.completed:";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCanonicalUuid(value: unknown): value is string {
  return typeof value === "string" && CANONICAL_UUID.test(value);
}

function isValidAttempt(value: unknown): value is number {
  return Number.isSafeInteger(value) &&
    (value as number) >= 1 &&
    (value as number) <= POSTGRES_INTEGER_MAX;
}

function expectedIdempotencyKey(runId: string, stepId: string, attempt: number): string {
  return `${EVENT_PREFIX}${runId}:${stepId}:${attempt}`;
}

/** Stable key: repeated completion of the same PostgreSQL identity maps to the same event. */
export function createWorkflowStepCompletedEvent(input: {
  runId: string;
  stepId: string;
  attempt: number;
}): WorkflowStepCompletedEvent {
  if (!isRecord(input) || !isCanonicalUuid(input.runId) ||
      !isCanonicalUuid(input.stepId) || !isValidAttempt(input.attempt)) {
    throw new Error("workflow_outbox_event_invalid_identity");
  }

  const idempotencyKey = expectedIdempotencyKey(input.runId, input.stepId, input.attempt);
  // Defensive invariant: canonical UUIDs and a PostgreSQL integer must fit.
  if (idempotencyKey.length > 200) {
    throw new Error("workflow_outbox_idempotency_key_too_long");
  }

  return {
    eventType: "workflow.step.completed",
    idempotencyKey,
    payload: { run_id: input.runId, step_id: input.stepId, attempt: input.attempt },
  };
}

export function validateWorkflowOutboxEvent(value: unknown): value is WorkflowOutboxEvent {
  if (!isRecord(value) || value.eventType !== "workflow.step.completed" ||
      typeof value.idempotencyKey !== "string" || value.idempotencyKey.length === 0 ||
      value.idempotencyKey.length > 200 || !isRecord(value.payload)) return false;

  const payload = value.payload;
  if (!isCanonicalUuid(payload.run_id) || !isCanonicalUuid(payload.step_id) ||
      !isValidAttempt(payload.attempt)) return false;

  const expected = expectedIdempotencyKey(payload.run_id, payload.step_id, payload.attempt);
  return value.idempotencyKey === expected &&
    Object.keys(payload).every((key) => ["run_id", "step_id", "attempt"].includes(key)) &&
    Object.keys(payload).length === 3;
}
