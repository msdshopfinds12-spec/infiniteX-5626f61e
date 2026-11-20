import test from "node:test";
import assert from "node:assert/strict";
import {
  assertJsonByteLimit,
  assertStepDeadline,
  clampBatchLimit,
  createStepDeadline,
  executeWithinStepBudget,
  isClaimedRunOwnedBy,
  isClaimedRunValid,
  isValidAttempt,
  isWorkflowOwnedBy,
  readJsonBodyLimited,
  validateStepTimeoutSeconds,
} from "../supabase/functions/_shared/worker-security.mjs";

test("attempt validation accepts only positive safe integers", () => {
  assert.equal(isValidAttempt(1), true);
  assert.equal(isValidAttempt(Number.MAX_SAFE_INTEGER), true);
  for (const value of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "1", null]) {
    assert.equal(isValidAttempt(value), false);
  }
});

test("claimed run validation requires identifiers and a valid attempt", () => {
  const valid = { id: "run-1", workflow_id: "workflow-1", owner_id: "user-1", attempt: 1 };
  assert.equal(isClaimedRunValid(valid), true);
  assert.equal(isClaimedRunOwnedBy(valid, "user-1"), true);
  assert.equal(isClaimedRunOwnedBy(valid, "user-2"), false);
  assert.equal(isClaimedRunValid({ ...valid, attempt: 0 }), false);
  assert.equal(isClaimedRunValid(null), false);
  assert.equal(isClaimedRunValid([]), false);
});

test("workflow ownership requires exact workflow and owner identifiers", () => {
  const workflow = { id: "workflow-1", owner_id: "user-1" };
  assert.equal(isWorkflowOwnedBy(workflow, "workflow-1", "user-1"), true);
  assert.equal(isWorkflowOwnedBy(workflow, "workflow-2", "user-1"), false);
  assert.equal(isWorkflowOwnedBy(workflow, "workflow-1", "user-2"), false);
  assert.equal(isWorkflowOwnedBy(null, "workflow-1", "user-1"), false);
});

test("batch limits use a safe fallback and clamp to the configured maximum", () => {
  assert.equal(clampBatchLimit(undefined), 3);
  assert.equal(clampBatchLimit(1), 1);
  assert.equal(clampBatchLimit(5), 5);
  assert.equal(clampBatchLimit(99), 5);
  assert.equal(clampBatchLimit(0), 1);
  assert.equal(clampBatchLimit("4"), 3);
  assert.equal(clampBatchLimit(99, 8, 2), 2);
});

test("step timeout defaults when absent and rejects malformed or excessive values", () => {
  assert.equal(validateStepTimeoutSeconds(undefined), 30);
  assert.equal(validateStepTimeoutSeconds(null), 30);
  assert.equal(validateStepTimeoutSeconds(1), 1);
  assert.equal(validateStepTimeoutSeconds(300), 300);
  for (const value of [0, -1, 1.5, 301, "30", NaN]) {
    assert.throws(() => validateStepTimeoutSeconds(value));
  }
});

test("deadline uses a monotonic start and rejects invalid inputs", () => {
  assert.equal(createStepDeadline(5, 100), 5100);
  assert.throws(() => createStepDeadline(0, 100));
  assert.throws(() => createStepDeadline(5, NaN));
  assert.throws(() => assertStepDeadline(100, 100));
  assert.doesNotThrow(() => assertStepDeadline(101, 100));
});

test("JSON payload sizing measures UTF-8 bytes and rejects oversized values", () => {
  assert.equal(assertJsonByteLimit({ value: "ok" }, 20), 14);
  assert.throws(() => assertJsonByteLimit({ value: "é" }, 10), /payload_too_large/);
  assert.throws(() => assertJsonByteLimit(undefined, 100), /payload_not_json_serializable/);
  assert.throws(() => assertJsonByteLimit({}, 0), /maxBytes_must_be_positive_integer/);
});

test("limited JSON reader parses valid request bodies", async () => {
  const request = new Request("https://example.test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ safe: true }),
  });
  const result = await readJsonBodyLimited(request, 100);
  assert.deepEqual(result, { ok: true, value: { safe: true } });
});

test("limited JSON reader rejects malformed JSON and invalid UTF-8", async () => {
  const malformed = await readJsonBodyLimited(new Request("https://example.test", {
    method: "POST", body: "{",
  }), 100);
  assert.deepEqual(malformed, { ok: false, reason: "invalid_json" });

  const invalidUtf8 = new Request("https://example.test", {
    method: "POST",
    body: new Uint8Array([0xc3, 0x28]),
    duplex: "half",
  });
  assert.deepEqual(await readJsonBodyLimited(invalidUtf8, 100), {
    ok: false, reason: "invalid_json",
  });
});

test("limited JSON reader enforces actual streamed bytes", async () => {
  const result = await readJsonBodyLimited(new Request("https://example.test", {
    method: "POST", body: JSON.stringify({ value: "too long" }),
  }), 5);
  assert.deepEqual(result, { ok: false, reason: "payload_too_large" });
});

test("limited JSON reader treats an empty body as null", async () => {
  const result = await readJsonBodyLimited(new Request("https://example.test", {
    method: "POST",
  }), 100);
  assert.deepEqual(result, { ok: true, value: null });
});

test("step budget executes bounded actions and validates output size", () => {
  const times = [0, 0, 10];
  const result = executeWithinStepBudget(
    () => ({ result: "ok" }),
    { input: "small" },
    1,
    100,
    () => times.shift() ?? 10,
  );
  assert.deepEqual(result, { result: "ok" });

  const oversized = [0, 0, 10];
  assert.throws(() => executeWithinStepBudget(
    () => ({ result: "x".repeat(200) }),
    {},
    1,
    20,
    () => oversized.shift() ?? 10,
  ), /payload_too_large/);
});

test("step budget rejects expired deadlines and non-function actions", () => {
  assert.throws(() => executeWithinStepBudget(() => ({}), {}, 1, 100, () => 0), /step_timeout_exceeded/);
  assert.throws(() => executeWithinStepBudget(null, {}, 1), /action_must_be_function/);
});
