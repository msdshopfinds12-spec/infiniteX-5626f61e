import test from "node:test";
import assert from "node:assert/strict";
import { completeWorkflowStepWithOutbox } from "../../supabase/functions/_shared/workflow-completion.ts";

const validInput = {
  ownerId: "81000000-1000-4000-8000-000000000001",
  runId: "81000000-3000-4000-8000-000000000005",
  stepId: "81000000-2000-4000-8000-000000000001",
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
    { ...validInput, ownerId: "owner-1" },
    { ...validInput, runId: "run-1" },
    { ...validInput, stepId: "step-1" },
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
        return { data: [{ step_run_id: "81000000-4000-4000-8000-000000000005" }], error: null };
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
      assert.equal(args.p_owner_id, "81000000-1000-4000-8000-000000000001");
      assert.equal(args.p_attempt, 1);
      return { data: [{ step_run_id: "81000000-4000-4000-8000-000000000005", outbox_id: null, replayed: false }], error: null };
    },
    validInput,
  );

  assert.deepEqual(result, {
    stepRunId: "81000000-4000-4000-8000-000000000005",
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
          { step_run_id: "81000000-4000-4000-8000-000000000005", outbox_id: null, replayed: false },
          { step_run_id: "81000000-4000-4000-8000-000000000002" },
        ],
        error: null,
      }),
      validInput,
    ),
    { message: "step_run_finish_invalid_response" },
  );
});


test("completion helper rejects malformed RPC identity and replay fields", async () => {
  const invalidRows = [
    { step_run_id: "not-a-uuid", outbox_id: null, replayed: false },
    { step_run_id: "81000000-4000-4000-8000-000000000001", outbox_id: "not-a-uuid", replayed: false },
    { step_run_id: "81000000-4000-4000-8000-000000000001", outbox_id: null, replayed: "false" },
  ];
  for (const row of invalidRows) {
    await assert.rejects(
      completeWorkflowStepWithOutbox(async () => ({ data: [row], error: null }), validInput),
      { message: "step_run_finish_invalid_response" },
    );
  }
});
