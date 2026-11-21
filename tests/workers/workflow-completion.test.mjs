import test from "node:test";
import assert from "node:assert/strict";
import { completeWorkflowStepWithOutbox } from "../../supabase/functions/_shared/workflow-completion.ts";

const validInput = {
  ownerId: "owner-1",
  runId: "run-1",
  stepId: "step-1",
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
  for (const response of [undefined, null, {}, { data: null }, { data: [], error: null }]) {
    await assert.rejects(
      completeWorkflowStepWithOutbox(async () => response, validInput),
      (error) => error instanceof Error &&
        ["step_run_finish_failed", "workflow_step_attempt_superseded"].includes(error.message),
    );
  }
});
