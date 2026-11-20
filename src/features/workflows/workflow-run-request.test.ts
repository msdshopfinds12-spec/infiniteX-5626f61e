import assert from "node:assert/strict";
import test from "node:test";
import type { Json } from "../../lib/supabase/database.types";
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

test("omitted workflow input defaults to an empty JSON object", () => {
  assert.deepEqual(createWorkflowRunRequest("workflow-123").input, {});
});

test("workflow run request rejects an empty workflow id", () => {
  assert.throws(
    () => createWorkflowRunRequest("   "),
    { name: "TypeError", message: "A workflow ID is required." },
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

test("request input is deeply cloned and frozen", () => {
  const nestedValue = { enabled: true };
  const original = { nested: { values: [1, nestedValue] } };
  const request = createWorkflowRunRequest("workflow-123", original);

  nestedValue.enabled = false;
  original.nested.values.push(2);

  assert.deepEqual(request.input, {
    nested: { values: [1, { enabled: true }] },
  });
  assert.equal(Object.isFrozen(request), true);
  assert.equal(Object.isFrozen(request.input), true);
  const nested = request.input as unknown as { nested: { values: readonly Json[] } };
  assert.equal(Object.isFrozen(nested.nested), true);
  assert.equal(Object.isFrozen(nested.nested.values), true);
});

test("request input rejects circular references", () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;

  assert.throws(
    () => createWorkflowRunRequest("workflow-123", circular as unknown as Json),
    /circular references/,
  );
});

test("request input rejects non-finite numbers and non-JSON values", () => {
  for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, undefined, BigInt(1)]) {
    assert.throws(
      () => createWorkflowRunRequest("workflow-123", invalid as unknown as Json),
      TypeError,
    );
  }
});

test("request input rejects class instances and accessors", () => {
  class CustomInput {
    value = "not plain JSON";
  }

  const accessor = Object.defineProperty({}, "value", {
    enumerable: true,
    get() {
      throw new Error("getter must not execute");
    },
  });

  assert.throws(
    () => createWorkflowRunRequest("workflow-123", new CustomInput() as unknown as Json),
    /plain JSON objects/,
  );
  assert.throws(
    () => createWorkflowRunRequest("workflow-123", accessor as Json),
    /accessors/,
  );
});

test("request input rejects symbol keys", () => {
  const input = { value: "safe", [Symbol("hidden")]: "not JSON" };

  assert.throws(
    () => createWorkflowRunRequest("workflow-123", input as unknown as Json),
    /symbol keys/,
  );
});

test("request input rejects sparse arrays and array accessors", () => {
  const sparse = new Array(2);
  const accessorArray: unknown[] = [];
  Object.defineProperty(accessorArray, "0", {
    enumerable: true,
    get() {
      throw new Error("array getter must not execute");
    },
  });
  accessorArray.length = 1;

  assert.throws(
    () => createWorkflowRunRequest("workflow-123", sparse as unknown as Json),
    /dense JSON arrays/,
  );
  assert.throws(
    () => createWorkflowRunRequest("workflow-123", accessorArray as unknown as Json),
    /holes or accessors/,
  );
});
