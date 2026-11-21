export type ClaimedWorkflowOutboxEvent = {
  id: string;
  owner_id: string;
  event_type: string;
  idempotency_key: string;
  payload: Record<string, unknown>;
  attempts: number;
  lock_token: string;
  lease_until: string;
};

export type OutboxDryRunPlan = {
  mode: "dry_run";
  deliveryAttempted: false;
  eventId: string;
  eventType: "notification.requested";
  adapter: "notification-intent-preview-v1";
  idempotencyKey: string;
  payload: {
    recipient_ref: string;
    template_key: string;
  };
  outcome: "validated_not_delivered";
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TEMPLATE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

/**
 * Pure dry-run dispatcher core. It validates a claimed lease and resolves a
 * closed adapter; it has no database client, fetch/network capability, secret
 * resolver, or provider side effect. A plan is explicitly NOT delivery.
 */
export function createOutboxDryRunPlan(
  event: ClaimedWorkflowOutboxEvent,
  nowMs: number,
): OutboxDryRunPlan {
  if (
    !event ||
    !UUID_PATTERN.test(event.id) ||
    !UUID_PATTERN.test(event.owner_id) ||
    !UUID_PATTERN.test(event.lock_token) ||
    event.event_type !== "notification.requested" ||
    typeof event.idempotency_key !== "string" ||
    event.idempotency_key.length < 1 ||
    event.idempotency_key.length > 200 ||
    !Number.isSafeInteger(event.attempts) ||
    event.attempts < 1 ||
    event.attempts > 8 ||
    typeof event.lease_until !== "string" ||
    !Number.isFinite(Date.parse(event.lease_until)) ||
    Date.parse(event.lease_until) <= nowMs ||
    !event.payload ||
    typeof event.payload !== "object" ||
    Array.isArray(event.payload)
  ) {
    throw new Error("outbox_dry_run_invalid_claim");
  }

  const keys = Object.keys(event.payload).sort();
  const recipientRef = event.payload.recipient_ref;
  const templateKey = event.payload.template_key;
  if (
    keys.length !== 2 ||
    keys[0] !== "recipient_ref" ||
    keys[1] !== "template_key" ||
    recipientRef !== event.owner_id ||
    typeof recipientRef !== "string" ||
    !UUID_PATTERN.test(recipientRef) ||
    typeof templateKey !== "string" ||
    !TEMPLATE_PATTERN.test(templateKey)
  ) {
    throw new Error("outbox_dry_run_invalid_payload");
  }

  return {
    mode: "dry_run",
    deliveryAttempted: false,
    eventId: event.id,
    eventType: "notification.requested",
    adapter: "notification-intent-preview-v1",
    idempotencyKey: event.idempotency_key,
    payload: { recipient_ref: recipientRef, template_key: templateKey },
    outcome: "validated_not_delivered",
  };
}
