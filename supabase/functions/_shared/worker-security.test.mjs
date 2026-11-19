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
  isWorkflowOwnedBy,
  readJsonBodyLimited,
  validateStepTimeoutSeconds,
} from "./worker-security.mjs";

const validRun = { id: "run-a", workflow_id: "workflow-a", owner_id: "user-a" };

test("validates claimed-run shape and rejects malformed values", () => {
  assert.equal(isClaimedRunValid(validRun), true);
  for (const value of [null, [], {}, { ...validRun, owner_id: "" }, { ...validRun, id: 7 }]) {
    assert.equal(isClaimedRunValid(value), false);
  }
});

test("binds claimed runs and parent workflows to the authenticated owner", () => {
  assert.equal(isClaimedRunOwnedBy(validRun, "user-a"), true);
  assert.equal(isClaimedRunOwnedBy(validRun, "user-b"), false);
  assert.equal(isClaimedRunOwnedBy(validRun, ""), false);
  const workflow = { id: "workflow-a", owner_id: "user-a" };
  assert.equal(isWorkflowOwnedBy(workflow, "workflow-a", "user-a"), true);
  assert.equal(isWorkflowOwnedBy(workflow, "workflow-a", "user-b"), false);
  assert.equal(isWorkflowOwnedBy(workflow, "workflow-b", "user-a"), false);
  assert.equal(isWorkflowOwnedBy(null, "workflow-a", "user-a"), false);
});

test("clamps queue batch limits to safe integer bounds", () => {
  assert.equal(clampBatchLimit(undefined), 3);
  assert.equal(clampBatchLimit(0), 1);
  assert.equal(clampBatchLimit(2), 2);
  assert.equal(clampBatchLimit(999), 5);
  assert.equal(clampBatchLimit(2.5), 3);
});

test("validates timeout defaults and rejects malformed or excessive values", () => {
  assert.equal(validateStepTimeoutSeconds(undefined), 30);
  assert.equal(validateStepTimeoutSeconds(null), 30);
  assert.equal(validateStepTimeoutSeconds(12), 12);
  assert.throws(() => validateStepTimeoutSeconds(0), /step_timeout_seconds_invalid/);
  assert.throws(() => validateStepTimeoutSeconds(301), /step_timeout_seconds_invalid/);
  assert.throws(() => validateStepTimeoutSeconds(1.5), /step_timeout_seconds_invalid/);
});

test("uses monotonic deadline checks and reports elapsed budgets", () => {
  const deadline = createStepDeadline(2, 100);
  assert.equal(deadline, 2100);
  assert.doesNotThrow(() => assertStepDeadline(deadline, 2099));
  assert.throws(() => assertStepDeadline(deadline, 2100), /step_timeout_exceeded/);
});

test("enforces UTF-8 JSON payload byte limits", () => {
  assert.equal(assertJsonByteLimit({ text: "ok" }, 32) > 0, true);
  assert.throws(() => assertJsonByteLimit({ text: "é".repeat(20) }, 32), /payload_too_large/);
  assert.throws(() => assertJsonByteLimit({ value: 1 }, 0), /maxBytes_must_be_positive_integer/);
  const circular = {};
  circular.self = circular;
  assert.throws(() => assertJsonByteLimit(circular, 100), /payload_not_json_serializable/);
});

test("reads valid JSON and enforces actual streamed bytes", async () => {
  const request = new Request("https://example.test", {
    method: "POST",
    body: JSON.stringify({ limit: 2 }),
    headers: { "content-type": "application/json" },
  });
  assert.deepEqual(await readJsonBodyLimited(request, 64), {
    ok: true, value: { limit: 2 },
  });
  const oversized = new Request("https://example.test", {
    method: "POST",
    body: JSON.stringify({ payload: "x".repeat(128) }),
  });
  assert.deepEqual(await readJsonBodyLimited(oversized, 32), {
    ok: false, reason: "payload_too_large",
  });
});

test("rejects malformed JSON, invalid UTF-8, and accepts empty bodies", async () => {
  const malformed = new Request("https://example.test", { method: "POST", body: "{" });
  const empty = new Request("https://example.test", { method: "POST" });
  const invalidUtf8 = new Request("https://example.test", {
    method: "POST",
    body: new Uint8Array([0x7b, 0xff, 0x7d]),
  });
  assert.deepEqual(await readJsonBodyLimited(malformed, 32), { ok: false, reason: "invalid_json" });
  assert.deepEqual(await readJsonBodyLimited(invalidUtf8, 32), { ok: false, reason: "invalid_json" });
  assert.deepEqual(await readJsonBodyLimited(empty, 32), { ok: true, value: null });
});

test("executes bounded local actions once and checks deadline after execution", () => {
  let calls = 0;
  const result = executeWithinStepBudget(() => { calls++; return { ok: true }; }, { input: 1 }, 2, 64, () => 100);
  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 1);
  const times = [100, 100, 2100];
  let index = 0;
  assert.throws(() => executeWithinStepBudget(() => ({ ok: true }), {}, 2, 64, () => times[index++]), /step_timeout_exceeded/);
});

test("rejects oversized action inputs before invoking the action", () => {
  let invoked = false;
  assert.throws(() => executeWithinStepBudget(() => { invoked = true; return {}; }, { text: "x".repeat(100) }, 2, 16), /payload_too_large/);
  assert.equal(invoked, false);
});
