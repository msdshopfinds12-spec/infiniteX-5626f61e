import test from "node:test";
import assert from "node:assert/strict";
import {
  clampBatchLimit,
  isClaimedRunOwnedBy,
  isClaimedRunValid,
  isWorkflowOwnedBy,
  readJsonBodyLimited,
} from "./worker-security.mjs";

const validRun = { id: "run-a", workflow_id: "workflow-a", owner_id: "user-a" };

test("accepts a structurally valid claimed run", () => {
  assert.equal(isClaimedRunValid(validRun), true);
});

test("rejects null, arrays, and incomplete claimed runs", () => {
  for (const value of [null, [], {}, { ...validRun, owner_id: "" }, { ...validRun, id: 7 }]) {
    assert.equal(isClaimedRunValid(value), false);
  }
});

test("claimed runs are bound to the authenticated owner", () => {
  assert.equal(isClaimedRunOwnedBy(validRun, "user-a"), true);
  assert.equal(isClaimedRunOwnedBy(validRun, "user-b"), false);
  assert.equal(isClaimedRunOwnedBy(validRun, ""), false);
});

test("parent workflow must match both workflow id and owner id", () => {
  const workflow = { id: "workflow-a", owner_id: "user-a" };
  assert.equal(isWorkflowOwnedBy(workflow, "workflow-a", "user-a"), true);
  assert.equal(isWorkflowOwnedBy(workflow, "workflow-a", "user-b"), false);
  assert.equal(isWorkflowOwnedBy(workflow, "workflow-b", "user-a"), false);
  assert.equal(isWorkflowOwnedBy(null, "workflow-a", "user-a"), false);
});

test("batch limits are integer-clamped to the safe range", () => {
  assert.equal(clampBatchLimit(undefined), 3);
  assert.equal(clampBatchLimit(0), 1);
  assert.equal(clampBatchLimit(2), 2);
  assert.equal(clampBatchLimit(999), 5);
  assert.equal(clampBatchLimit(2.5), 3);
});

test("body reader enforces the actual byte limit and parses valid JSON", async () => {
  const request = new Request("https://example.test", {
    method: "POST",
    body: JSON.stringify({ limit: 2 }),
    headers: { "content-type": "application/json" },
  });
  assert.deepEqual(await readJsonBodyLimited(request, 64), {
    ok: true,
    value: { limit: 2 },
  });
});

test("body reader rejects oversized bodies even without a content-length header", async () => {
  const request = new Request("https://example.test", {
    method: "POST",
    body: JSON.stringify({ payload: "x".repeat(128) }),
  });
  assert.deepEqual(await readJsonBodyLimited(request, 32), {
    ok: false,
    reason: "payload_too_large",
  });
});

test("body reader reports malformed JSON and accepts an empty body", async () => {
  const malformed = new Request("https://example.test", { method: "POST", body: "{" });
  const empty = new Request("https://example.test", { method: "POST" });
  assert.deepEqual(await readJsonBodyLimited(malformed, 32), { ok: false, reason: "invalid_json" });
  assert.deepEqual(await readJsonBodyLimited(empty, 32), { ok: true, value: null });
});
