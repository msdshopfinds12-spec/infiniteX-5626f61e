import test from "node:test";
import assert from "node:assert/strict";
import { createWorkflowStepCompletedEvent, validateWorkflowOutboxEvent } from "../../supabase/functions/_shared/workflow-outbox-contract.ts";
import { planOutboxDryRun, planOutboxDryRunBatch } from "../../supabase/functions/_shared/outbox-dry-run.ts";

test("event contract creates a deterministic allowlisted event", () => {
  const first = createWorkflowStepCompletedEvent({ runId: "11111111-1111-4111-8111-111111111111", stepId: "22222222-2222-4222-8222-222222222222", attempt: 2 });
  const second = createWorkflowStepCompletedEvent({ runId: "11111111-1111-4111-8111-111111111111", stepId: "22222222-2222-4222-8222-222222222222", attempt: 2 });
  assert.deepEqual(first, second);
  assert.equal(validateWorkflowOutboxEvent(first), true);
});

test("event contract rejects invalid identity and forged idempotency keys", () => {
  assert.throws(() => createWorkflowStepCompletedEvent({ runId: "", stepId: "22222222-2222-4222-8222-222222222222", attempt: 1 }));
  const event = createWorkflowStepCompletedEvent({ runId: "11111111-1111-4111-8111-111111111111", stepId: "22222222-2222-4222-8222-222222222222", attempt: 1 });
  assert.equal(validateWorkflowOutboxEvent({ ...event, idempotencyKey: "attacker-controlled" }), false);
  assert.equal(validateWorkflowOutboxEvent({ ...event, payload: { ...event.payload, callback_url: "https://example.invalid" } }), false);
});

test("dry-run planner approves only the known contract and never delivers", () => {
  const event = createWorkflowStepCompletedEvent({ runId: "11111111-1111-4111-8111-111111111111", stepId: "22222222-2222-4222-8222-222222222222", attempt: 1 });
  const plan = planOutboxDryRun({ id: "event-1", event_type: event.eventType, idempotency_key: event.idempotencyKey, payload: event.payload });
  assert.equal(plan.decision, "would_dispatch");
  assert.equal(plan.mode, "dry_run");
  assert.equal(plan.deliveryPerformed, false);
  const unknown = planOutboxDryRun({ id: "event-2", event_type: "arbitrary.url", idempotency_key: "x", payload: { url: "https://example.invalid" } });
  assert.equal(unknown.decision, "blocked");
  assert.equal(unknown.deliveryPerformed, false);
});

test("dry-run batch is bounded and rejects non-arrays", () => {
  assert.throws(() => planOutboxDryRunBatch({}));
  assert.throws(() => planOutboxDryRunBatch(Array.from({ length: 11 }, () => ({}))));
  assert.deepEqual(planOutboxDryRunBatch([]), []);
});


test("event contract rejects delimiter-bearing and non-UUID identities", () => {
  assert.throws(() => createWorkflowStepCompletedEvent({
    runId: "alpha:beta",
    stepId: "gamma",
    attempt: 1,
  }), { message: "workflow_outbox_event_invalid_identity" });
  assert.throws(() => createWorkflowStepCompletedEvent({
    runId: "11111111-1111-4111-8111-111111111111",
    stepId: "22222222-2222-4222-8222-222222222222",
    attempt: 2_147_483_648,
  }), { message: "workflow_outbox_event_invalid_identity" });
});

test("event contract enforces bounded PostgreSQL integer attempts and stable UUID keys", () => {
  const input = {
    runId: "11111111-1111-4111-8111-111111111111",
    stepId: "22222222-2222-4222-8222-222222222222",
    attempt: 2_147_483_647,
  };
  const event = createWorkflowStepCompletedEvent(input);
  assert.equal(event.idempotencyKey.length <= 200, true);
  assert.equal(validateWorkflowOutboxEvent(event), true);
  assert.equal(
    createWorkflowStepCompletedEvent(input).idempotencyKey,
    event.idempotencyKey,
  );
});
