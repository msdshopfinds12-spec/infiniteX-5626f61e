import test from "node:test";
import assert from "node:assert/strict";
import { completeWorkflowStepWithOutbox } from "../../supabase/functions/_shared/workflow-completion.ts";

const validInput = {
  ownerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  runId: "11111111-1111-4111-8111-111111111111",
  stepId: "22222222-2222-4222-8222-222222222222",
  attempt: 1,
  output: { ok: true },
};

test("completion helper rejects malformed runtime identities before invoking RPC", async () => {
  const invalidInputs = [
    null,
    undefined,
    {},
    { ...validInput, ownerId: null },
    { ...validInput, ownerId: 42 },
    { ...validInput, ownerId: "owner-1" },
    { ...validInput, runId: "   " },
    { ...validInput, runId: "run-1" },
    { ...validInput, stepId: false },
    { ...validInput, stepId: "step-1" },
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

test("completion helper accepts canonical UUID identities and returns normalized result", async () => {
  const result = await completeWorkflowStepWithOutbox(
    async (name, args) => {
      assert.equal(name, "simula_complete_step_with_outbox");
      assert.equal(args.p_owner_id, validInput.ownerId);
      assert.equal(args.p_run_id, validInput.runId);
      assert.equal(args.p_step_id, validInput.stepId);
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
