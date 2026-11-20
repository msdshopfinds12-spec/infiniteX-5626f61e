import assert from "node:assert/strict";
import test from "node:test";
import { createWorkflowRunService } from "./workflow-run-service.ts";
import { createWorkflowRunRequest } from "./workflow-run-request.ts";

const workflowId = "81000000-1000-4000-8000-000000000001";
const requestId = "85000000-3000-4000-8000-000000000001";

test("enqueue invokes only the authenticated Edge Function with the exact idempotent request", async () => {
  let invocation: { name: string; options: { body: unknown } } | null = null;
  const client = {
    functions: {
      invoke: async (name: string, options: { body: unknown }) => {
        invocation = { name, options };
        return {
          data: {
            ok: true,
            run: {
              id: requestId,
              status: "queued",
              created_at: "2026-11-21T00:00:00.000Z",
              replayed: false,
            },
          },
          error: null,
        };
      },
    },
  } as never;

  const service = createWorkflowRunService(client);
  const result = await service.enqueue(createWorkflowRunRequest(workflowId, { task: "test" }), requestId);

  assert.deepEqual(invocation, {
    name: "simula-workflow-run-request",
    options: {
      body: {
        workflow_id: workflowId,
        request_id: requestId,
        input: { task: "test" },
      },
    },
  });
  assert.deepEqual(result, {
    status: "success",
    run: {
      id: requestId,
      status: "queued",
      created_at: "2026-11-21T00:00:00.000Z",
      replayed: false,
    },
  });
});

test("invalid workflow or idempotency UUID is rejected before network invocation", async () => {
  let calls = 0;
  const client = {
    functions: { invoke: async () => { calls += 1; return { data: null, error: null }; } },
  } as never;
  const service = createWorkflowRunService(client);

  const invalidWorkflow = await service.enqueue(
    createWorkflowRunRequest("not-a-uuid", {}),
    requestId,
  );
  const invalidRequest = await service.enqueue(
    createWorkflowRunRequest(workflowId, {}),
    "not-a-uuid",
  );

  assert.deepEqual(invalidWorkflow, { status: "error", code: "invalid_request" });
  assert.deepEqual(invalidRequest, { status: "error", code: "invalid_request" });
  assert.equal(calls, 0);
});

test("network/function errors are sanitized and never expose provider messages", async () => {
  const client = {
    functions: {
      invoke: async () => ({
        data: null,
        error: new Error("secret project URL and token must not escape"),
      }),
    },
  } as never;
  const service = createWorkflowRunService(client);
  const result = await service.enqueue(createWorkflowRunRequest(workflowId, {}), requestId);
  assert.deepEqual(result, { status: "error", code: "request_failed" });
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("malformed or mismatched server response is rejected", async () => {
  const client = {
    functions: {
      invoke: async () => ({
        data: { ok: true, run: { id: "85000000-3000-4000-8000-000000000099", status: "succeeded" } },
        error: null,
      }),
    },
  } as never;
  const service = createWorkflowRunService(client);
  const result = await service.enqueue(createWorkflowRunRequest(workflowId, {}), requestId);
  assert.deepEqual(result, { status: "error", code: "invalid_response" });
});
