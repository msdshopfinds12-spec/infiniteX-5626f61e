import test from "node:test";
import assert from "node:assert/strict";
import {
  IDEMPOTENCY_KEY_PATTERN,
  WORKFLOW_API_MAX_BODY_BYTES,
  validateEnqueueWorkflowRequest,
  validateIdempotencyKey,
  parseWorkflowApiRoute,
} from "./workflow-api-contract.mjs";

const WORKFLOW_ID = "11111111-1111-4111-8111-111111111111";

test("accepts the minimal trusted enqueue DTO and defaults input to an empty object", () => {
  const result = validateEnqueueWorkflowRequest({ workflow_id: " " + WORKFLOW_ID + " " });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { workflow_id: WORKFLOW_ID, input: {} });
});

test("accepts JSON input and does not add owner or lifecycle fields", () => {
  const result = validateEnqueueWorkflowRequest({
    workflow_id: WORKFLOW_ID,
    input: { title: "hello", count: 3, enabled: true, tags: ["a", "b"] },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.value).sort(), ["input", "workflow_id"]);
});

test("rejects client-supplied ownership and lifecycle fields", () => {
  for (const field of ["owner_id", "status", "attempt", "output", "started_at", "worker_id", "lease_token"]) {
    const result = validateEnqueueWorkflowRequest({ workflow_id: WORKFLOW_ID, [field]: "forged" });
    assert.deepEqual(result, { ok: false, code: "unknown_or_forbidden_field" });
  }
});

test("rejects malformed bodies and non-UUID workflow IDs", () => {
  for (const value of [null, [], "text", 1, {}, { workflow_id: "" }, { workflow_id: "  " }, { workflow_id: "not-a-uuid" }]) {
    assert.equal(validateEnqueueWorkflowRequest(value).ok, false);
  }
});

test("rejects prototype-sensitive keys", () => {
  const input = JSON.parse('{"safe":1,"__proto__":{"polluted":true}}');
  assert.deepEqual(validateEnqueueWorkflowRequest({ workflow_id: WORKFLOW_ID, input }), {
    ok: false, code: "input_contains_forbidden_key",
  });
});

test("rejects excessive depth, node count, array length, and object key count", () => {
  let deep = {};
  let cursor = deep;
  for (let i = 0; i < 14; i += 1) cursor = cursor.next = {};
  assert.equal(validateEnqueueWorkflowRequest({ workflow_id: WORKFLOW_ID, input: deep }).code, "input_too_deep");
  assert.equal(validateEnqueueWorkflowRequest({ workflow_id: WORKFLOW_ID, input: Array(101).fill(1) }).code, "input_array_too_large");
  const wide = Object.fromEntries(Array.from({ length: 101 }, (_, i) => ["k" + i, i]));
  assert.equal(validateEnqueueWorkflowRequest({ workflow_id: WORKFLOW_ID, input: wide }).code, "input_object_too_large");
});

test("enforces serialized UTF-8 input byte budget", () => {
  const tooLarge = { text: "x".repeat(WORKFLOW_API_MAX_BODY_BYTES) };
  assert.equal(validateEnqueueWorkflowRequest({ workflow_id: WORKFLOW_ID, input: tooLarge }).code, "input_too_large");
  assert.equal(validateEnqueueWorkflowRequest({ workflow_id: WORKFLOW_ID, input: { text: "é" } }).ok, true);
});

test("accepts only bounded opaque idempotency keys", () => {
  assert.equal(validateIdempotencyKey("idem-key-123"), true);
  assert.equal(validateIdempotencyKey("a".repeat(128)), true);
  for (const value of [undefined, "", "short", "a".repeat(129), "key with spaces", "key/unsafe", 123]) {
    assert.equal(validateIdempotencyKey(value), false);
  }
  assert.equal(IDEMPOTENCY_KEY_PATTERN.test("safe.key:123-abc"), true);
});

test("parses collection route with or without the function gateway prefix", () => {
  assert.deepEqual(parseWorkflowApiRoute("/runs"), { resource: "runs" });
  assert.deepEqual(parseWorkflowApiRoute("/functions/v1/simula-workflow-api/runs"), { resource: "runs" });
});

test("parses only a single UUID run resource and queued cancellation route", () => {
  const id = "a3b2564d-88b8-43f3-8aa7-b2370ec866f1";
  assert.deepEqual(parseWorkflowApiRoute("/functions/v1/simula-workflow-api/runs/" + id), {
    resource: "run", runId: id,
  });
  assert.deepEqual(parseWorkflowApiRoute("/runs/" + id + "/cancel"), { resource: "cancel", runId: id });
  for (const path of [
    "/runs/not-a-uuid",
    "/runs/" + id + "/extra",
    "/unrelated/runs",
    "/functions/v1/other/runs",
  ]) assert.equal(parseWorkflowApiRoute(path), null);
});
