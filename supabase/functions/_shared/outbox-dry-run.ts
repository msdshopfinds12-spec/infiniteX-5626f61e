import { validateWorkflowOutboxEvent } from "./workflow-outbox-contract.ts";

export type OutboxDryRunRow = {
  id: string;
  event_type: string;
  idempotency_key: string;
  payload: unknown;
};
export type OutboxDryRunPlan = {
  eventId: string;
  decision: "would_dispatch" | "blocked";
  reason: string;
  mode: "dry_run";
  deliveryPerformed: false;
};

/**
 * Pure planner only: does not claim rows, mutate PostgreSQL, call providers,
 * follow URLs, execute code, or send network requests.
 */
export function planOutboxDryRun(row: unknown): OutboxDryRunPlan {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    return { eventId: "unknown", decision: "blocked", reason: "invalid_event_envelope", mode: "dry_run", deliveryPerformed: false };
  }
  const event = row as Record<string, unknown>;
  const eventId = typeof event.id === "string" && event.id.length <= 200 ? event.id : "unknown";
  const contract = {
    eventType: event.event_type,
    idempotencyKey: event.idempotency_key,
    payload: event.payload,
  };
  if (typeof event.id !== "string" || event.id.trim().length === 0 ||
      !validateWorkflowOutboxEvent(contract)) {
    return { eventId, decision: "blocked", reason: "event_contract_rejected", mode: "dry_run", deliveryPerformed: false };
  }
  return {
    eventId,
    decision: "would_dispatch",
    reason: "allowlisted_event_validated_no_delivery",
    mode: "dry_run",
    deliveryPerformed: false,
  };
}

export function planOutboxDryRunBatch(value: unknown): OutboxDryRunPlan[] {
  if (!Array.isArray(value) || value.length > 10) {
    throw new Error("outbox_dry_run_batch_invalid");
  }
  return value.map(planOutboxDryRun);
}
