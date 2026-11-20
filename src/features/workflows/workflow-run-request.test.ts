import assert from "node:assert/strict";
import test from "node:test";
import { createWorkflowRunRequest } from "./workflow-run-request.ts";

test("workflow run request contains only workflow id and input", () => {
  const request = createWorkflowRunRequest(" workflow-123 ", {
    prompt: "synthetic test",
    options: { retries: 2 },
  });

  assert.deepEqual(request, {
    workflow_id: "workflow-123",
    input: {
      prompt: "synthetic test",
      options: { retries: 2 },
    },
  });
  assert.deepEqual(Object.keys(request).sort(), ["input", "workflow_id"]);
});

test("workflow run request rejects an empty workflow id", () => {
  assert.throws(
    () => createWorkflowRunRequest("   "),
    { name: "TypeError", message: "workflow_id must be a non-empty string" },
  );
});

test("workflow run request does not accept client-owned lifecycle fields", () => {
  const request = createWorkflowRunRequest("workflow-123", {});
  const forbiddenFields = [
    "owner_id",
    "status",
    "output",
    "error_message",
    "attempt",
    "started_at",
    "finished_at",
    "scheduled_for",
  ];

  for (const field of forbiddenFields) {
    assert.equal(field in request, false, `unexpected field: ${field}`);
  }
});
