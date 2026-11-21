import test from "node:test";
import assert from "node:assert/strict";
import { completeWorkflowStepWithOutbox } from "../../supabase/functions/_shared/workflow-completion.ts";

const validInput = {
  ownerId: "owner-1",
  runId: "11111111-1111-4111-8111-111111111111",
  stepId: "22222222-2222-4222-8222-222222222222",
  attempt: 1,
  output: { ok: true },
};

test("completion helper rejects malformed runtime input before invoking RPC", async () => {
  const invalidInputs = [
    null,
    undefined,
    {},
    { ...validInput, ownerId: null },
    { ...validInput, ownerId: 42 },
    { ...validInput, runId: "   " },
    { ...validInput, stepId: false },
    { ...validInput, attempt: 0 },
    { ...validInput, attempt: Number.NaN },
    { ...validInput, attempt: 2_147_483_648 },
    { ...validInput, output: [] },
    { ...validInput, output: null },
  ];
  let calls = 0;

  for (const input of invalidInputs) {
    await assert.rejects(
      completeWorkflowStepWithOutbox(async () => {
        calls += 1;
        return { data: [{ step_run_id: "step-run-1" }], error: null };
      }, input),
      { message: "step_run_finish_invalid_input" },
    );
  }

  assert.equal(calls, 0, "invalid runtime values must never reach the database");
});

test("completion helper rejects a missing RPC function before invoking anything", async () => {
  await assert.rejects(
    completeWorkflowStepWithOutbox(null, validInput),
    { message: "step_run_finish_invalid_input" },
  );
});

test("completion helper accepts a valid RPC envelope and returns normalized identity", async () => {
  const result = await completeWorkflowStepWithOutbox(
    async (name, args) => {
      assert.equal(name, "simula_complete_step_with_outbox");
      assert.equal(args.p_owner_id, "owner-1");
      assert.equal(args.p_attempt, 1);
      return { data: [{ step_run_id: "step-run-1", outbox_id: null, replayed: false }], error: null };
    },
    validInput,
  );

  assert.deepEqual(result, {
    stepRunId: "step-run-1",
    outboxId: null,
    replayed: false,
  });
});

test("completion helper sanitizes malformed RPC envelopes", async () => {
  for (const response of [undefined, null, {}, { data: null }]) {
    await assert.rejects(
      completeWorkflowStepWithOutbox(async () => response, validInput),
      (error) => error instanceof Error &&
        error.message === "step_run_finish_failed",
    );
  }
});

test("completion helper rejects an empty RPC result array", async () => {
  await assert.rejects(
    completeWorkflowStepWithOutbox(
      async () => ({ data: [], error: null }),
      validInput,
    ),
    { message: "workflow_step_attempt_superseded" },
  );
});

test("completion helper rejects multiple returned completion rows", async () => {
  await assert.rejects(
    completeWorkflowStepWithOutbox(
      async () => ({
        data: [
          { step_run_id: "step-run-1" },
          { step_run_id: "step-run-2" },
        ],
        error: null,
      }),
      validInput,
    ),
    { message: "workflow_step_attempt_superseded" },
  );
});

import { createWorkflowStepCompletedEvent } from "../../supabase/functions/_shared/workflow-outbox-contract.ts";

test("completion helper atomically forwards only a validated optional outbox event", async () => {
  const event = createWorkflowStepCompletedEvent({ runId: "11111111-1111-4111-8111-111111111111", stepId: "22222222-2222-4222-8222-222222222222", attempt: 1 });
  const result = await completeWorkflowStepWithOutbox(async (_name, args) => {
    assert.equal(args.p_event_type, "workflow.step.completed");
    assert.equal(args.p_idempotency_key, event.idempotencyKey);
    assert.deepEqual(args.p_payload, event.payload);
    return { data: [{ step_run_id: "step-run-1", outbox_id: "outbox-1", replayed: false }], error: null };
  }, { ...validInput, outboxEvent: event });
  assert.equal(result.outboxId, "outbox-1");
});

test("completion helper rejects event identity mismatch before RPC", async () => {
  const event = createWorkflowStepCompletedEvent({ runId: "33333333-3333-4333-8333-333333333333", stepId: "22222222-2222-4222-8222-222222222222", attempt: 1 });
  let calls = 0;
  await assert.rejects(
    completeWorkflowStepWithOutbox(async () => {
      calls++;
      return { data: [{ step_run_id: "step-run-1" }], error: null };
    }, { ...validInput, outboxEvent: event }),
    { message: "step_run_finish_invalid_input" },
  );
  assert.equal(calls, 0);
});
