import test from "node:test";
import assert from "node:assert/strict";
import { completeWorkflowStepWithOutbox } from "../../supabase/functions/_shared/workflow-completion.ts";
import { createWorkflowStepCompletedEvent } from "../../supabase/functions/_shared/workflow-outbox-contract.ts";

const validInput = {
  ownerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  runId: "11111111-1111-4111-8111-111111111111",
  stepId: "22222222-2222-4222-8222-222222222222",
  attempt: 1,
  output: { ok: true },
};
const validRow = {
  step_run_id: "33333333-3333-4333-8333-333333333333",
  outbox_id: null,
  replayed: false,
};

test("completion helper rejects malformed identities and values before RPC", async () => {
  const invalidInputs = [
    null, undefined, {}, { ...validInput, ownerId: null },
    { ...validInput, ownerId: "owner-1" },
    { ...validInput, runId: "run-1" },
    { ...validInput, stepId: "step-1" },
    { ...validInput, attempt: 0 },
    { ...validInput, attempt: Number.NaN },
    { ...validInput, attempt: 2_147_483_648 },
    { ...validInput, output: [] }, { ...validInput, output: null },
  ];
  let calls = 0;
  for (const input of invalidInputs) {
    await assert.rejects(
      completeWorkflowStepWithOutbox(async () => {
        calls += 1;
        return { data: [validRow], error: null };
      }, input),
      { message: "step_run_finish_invalid_input" },
    );
  }
  assert.equal(calls, 0);
});

test("completion helper rejects missing RPC function", async () => {
  await assert.rejects(
    completeWorkflowStepWithOutbox(null, validInput),
    { message: "step_run_finish_invalid_input" },
  );
});

test("completion helper accepts canonical UUIDs and normalizes valid RPC result", async () => {
  const result = await completeWorkflowStepWithOutbox(async (name, args) => {
    assert.equal(name, "simula_complete_step_with_outbox");
    assert.equal(args.p_owner_id, validInput.ownerId);
    assert.equal(args.p_run_id, validInput.runId);
    assert.equal(args.p_step_id, validInput.stepId);
    assert.equal(args.p_attempt, 1);
    return { data: [validRow], error: null };
  }, validInput);
  assert.deepEqual(result, {
    stepRunId: validRow.step_run_id,
    outboxId: null,
    replayed: false,
  });
});

test("completion helper sanitizes thrown RPC errors and malformed envelopes", async () => {
  await assert.rejects(
    completeWorkflowStepWithOutbox(async () => { throw new Error("sensitive database detail"); }, validInput),
    { message: "step_run_finish_failed" },
  );
  for (const response of [undefined, null, {}, { data: null }, { data: [validRow], error: {} }]) {
    await assert.rejects(
      completeWorkflowStepWithOutbox(async () => response, validInput),
      { message: "step_run_finish_failed" },
    );
  }
});

test("completion helper rejects empty and ambiguous RPC row sets", async () => {
  for (const data of [[], [validRow, validRow]]) {
    await assert.rejects(
      completeWorkflowStepWithOutbox(async () => ({ data, error: null }), validInput),
      { message: "workflow_step_attempt_superseded" },
    );
  }
});

test("completion helper rejects malformed database result fields", async () => {
  const invalidRows = [
    { ...validRow, step_run_id: "not-a-uuid" },
    { ...validRow, outbox_id: "not-a-uuid" },
    { ...validRow, replayed: "false" },
    { step_run_id: validRow.step_run_id, outbox_id: null },
  ];
  for (const row of invalidRows) {
    await assert.rejects(
      completeWorkflowStepWithOutbox(async () => ({ data: [row], error: null }), validInput),
      { message: "workflow_step_attempt_superseded" },
    );
  }
});

test("completion helper forwards only a valid matching outbox event", async () => {
  const event = createWorkflowStepCompletedEvent({
    runId: validInput.runId, stepId: validInput.stepId, attempt: validInput.attempt,
  });
  const result = await completeWorkflowStepWithOutbox(async (_name, args) => {
    assert.equal(args.p_event_type, event.eventType);
    assert.equal(args.p_idempotency_key, event.idempotencyKey);
    assert.deepEqual(args.p_payload, event.payload);
    return { data: [{ ...validRow, outbox_id: "55555555-5555-4555-8555-555555555555" }], error: null };
  }, { ...validInput, outboxEvent: event });
  assert.equal(result.outboxId, "55555555-5555-4555-8555-555555555555");
});

test("completion helper rejects event identity mismatch before RPC", async () => {
  const event = createWorkflowStepCompletedEvent({
    runId: "66666666-6666-4666-8666-666666666666",
    stepId: validInput.stepId,
    attempt: validInput.attempt,
  });
  let calls = 0;
  await assert.rejects(
    completeWorkflowStepWithOutbox(async () => {
      calls += 1;
      return { data: [validRow], error: null };
    }, { ...validInput, outboxEvent: event }),
    { message: "step_run_finish_invalid_input" },
  );
  assert.equal(calls, 0);
});
