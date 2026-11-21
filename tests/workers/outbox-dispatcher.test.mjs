import test from "node:test";
import assert from "node:assert/strict";
import { createOutboxDryRunPlan } from "../../supabase/functions/_shared/workflow-outbox-dispatcher.ts";

const now = Date.parse("2026-11-21T08:00:00.000Z");
const validEvent = {
  id: "81000000-4000-4000-8000-000000000010",
  owner_id: "81000000-1000-4000-8000-000000000001",
  event_type: "notification.requested",
  idempotency_key: "phase90:owner:run:step:1:notification.requested",
  payload: {
    recipient_ref: "81000000-1000-4000-8000-000000000001",
    template_key: "welcome-v1",
  },
  attempts: 1,
  lock_token: "81000000-4000-4000-8000-000000000011",
  lease_until: "2026-11-21T08:01:00.000Z",
};

test("dry-run dispatcher resolves the fixed notification adapter without claiming delivery", () => {
  const plan = createOutboxDryRunPlan(validEvent, now);
  assert.equal(plan.mode, "dry_run");
  assert.equal(plan.deliveryAttempted, false);
  assert.equal(plan.eventType, "notification.requested");
  assert.equal(plan.adapter, "notification-intent-preview-v1");
  assert.equal(plan.outcome, "validated_not_delivered");
  assert.equal(plan.idempotencyKey, validEvent.idempotency_key);
  assert.deepEqual(plan.payload, validEvent.payload);
});

test("dry-run dispatcher rejects unknown event types, expired leases and invalid attempts", () => {
  assert.throws(() => createOutboxDryRunPlan({ ...validEvent, event_type: "webhook.send" }, now),
    /outbox_dry_run_invalid_claim/);
  assert.throws(() => createOutboxDryRunPlan({ ...validEvent, lease_until: "2026-11-21T07:59:00.000Z" }, now),
    /outbox_dry_run_invalid_claim/);
  assert.throws(() => createOutboxDryRunPlan({ ...validEvent, attempts: 9 }, now),
    /outbox_dry_run_invalid_claim/);
});

test("dry-run dispatcher rejects cross-owner recipients and arbitrary URL payloads", () => {
  assert.throws(() => createOutboxDryRunPlan({
    ...validEvent,
    payload: { ...validEvent.payload, recipient_ref: "81000000-4000-4000-8000-000000000099" },
  }, now), /outbox_dry_run_invalid_payload/);
  assert.throws(() => createOutboxDryRunPlan({
    ...validEvent,
    payload: { url: "https://attacker.example", headers: { Authorization: "secret" } },
  }, now), /outbox_dry_run_invalid_payload/);
});

test("dry-run dispatcher rejects extra payload keys and malformed template identifiers", () => {
  assert.throws(() => createOutboxDryRunPlan({
    ...validEvent,
    payload: { ...validEvent.payload, callback_url: "https://attacker.example" },
  }, now), /outbox_dry_run_invalid_payload/);
  assert.throws(() => createOutboxDryRunPlan({
    ...validEvent,
    payload: { ...validEvent.payload, template_key: "../external" },
  }, now), /outbox_dry_run_invalid_payload/);
});
