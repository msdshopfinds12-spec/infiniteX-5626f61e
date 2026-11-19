import test from "node:test";
import assert from "node:assert/strict";
import {
  assertIdempotencyKey, buildIdempotencyKey, classifyRetryError,
  computeRetryDelayMs, getRetryAfterMs, runWithRetry, validateRetryPolicy,
} from "./retry-reliability.mjs";

test("retry policy rejects unsafe, fractional, and excessive bounds", () => {
  assert.deepEqual(validateRetryPolicy(), {
    maxAttempts: 3, baseDelayMs: 250, maxDelayMs: 5000, maxElapsedMs: 15000,
  });
  for (const policy of [
    { maxAttempts: 0 }, { maxAttempts: 11 }, { maxAttempts: 1.5 },
    { baseDelayMs: -1 }, { maxDelayMs: 1, baseDelayMs: 2 }, { maxElapsedMs: 60001 },
  ]) assert.throws(() => validateRetryPolicy(policy));
});

test("classifies transient network and HTTP errors but rejects permanent errors", () => {
  for (const error of [
    Object.assign(new Error("busy"), { status: 503 }),
    Object.assign(new Error("rate limited"), { statusCode: 429 }),
    Object.assign(new Error("reset"), { code: "ECONNRESET" }),
  ]) assert.equal(classifyRetryError(error), "retryable");
  for (const error of [
    Object.assign(new Error("bad request"), { status: 400 }),
    Object.assign(new Error("bad input"), { code: "invalid_input" }),
    Object.assign(new Error("aborted"), { name: "AbortError", status: 503 }),
    Object.assign(new Error("permanent"), { status: 503, retryable: false }),
    null,
  ]) assert.equal(classifyRetryError(error), "permanent");
});

test("computes capped full jitter and honors bounded Retry-After", () => {
  const policy = { maxAttempts: 4, baseDelayMs: 100, maxDelayMs: 250, maxElapsedMs: 1000 };
  assert.equal(computeRetryDelayMs(1, policy, () => 0), 0);
  assert.equal(computeRetryDelayMs(1, policy, () => 0.5), 50);
  assert.equal(computeRetryDelayMs(2, policy, () => 0.99), 198);
  assert.equal(computeRetryDelayMs(3, policy, () => 0.99), 250);
  assert.equal(computeRetryDelayMs(1, policy, () => 0, 400), 250);
  assert.throws(() => computeRetryDelayMs(4, policy));
  assert.throws(() => computeRetryDelayMs(1, policy, () => 1));
});

test("parses Retry-After seconds and rejects malformed values", () => {
  assert.equal(getRetryAfterMs({ retryAfterMs: 120 }), 120);
  assert.equal(getRetryAfterMs({ headers: new Headers({ "retry-after": "2" }) }), 2000);
  assert.equal(getRetryAfterMs({ headers: new Headers({ "retry-after": "invalid" }) }), undefined);
});

test("retries transient errors with injected asynchronous scheduling", async () => {
  let calls = 0;
  const delays = [];
  const value = await runWithRetry(async ({ attempt }) => {
    calls++;
    if (attempt === 1) throw Object.assign(new Error("temporary"), { status: 503 });
    return "ok";
  }, { random: () => 0.5, wait: async (ms) => delays.push(ms), monotonicNow: () => 0 });
  assert.equal(value, "ok");
  assert.equal(calls, 2);
  assert.deepEqual(delays, [125]);
});

test("permanent failures are never retried", async () => {
  let calls = 0;
  await assert.rejects(runWithRetry(async () => {
    calls++;
    throw Object.assign(new Error("invalid"), { status: 400 });
  }, { wait: async () => assert.fail("must not wait") }));
  assert.equal(calls, 1);
});

test("side-effecting operations require a valid idempotency key before execution", async () => {
  let called = false;
  await assert.rejects(runWithRetry(async () => { called = true; }, { sideEffecting: true }));
  assert.equal(called, false);
  assert.equal(assertIdempotencyKey("ix1_12345678"), "ix1_12345678");
  assert.throws(() => assertIdempotencyKey("bad"));
});

test("idempotency keys are opaque and deterministic", async () => {
  const first = await buildIdempotencyKey({ runId: "run-1", stepId: "step-1" });
  const second = await buildIdempotencyKey({ runId: "run-1", stepId: "step-1" });
  assert.equal(first, second);
  assert.match(first, /^ix1_[a-f0-9]{64}$/);
  assert.notEqual(first, await buildIdempotencyKey({ runId: "run-2", stepId: "step-1" }));
});

test("retry attempts are bounded and reuse the same idempotency key", async () => {
  let calls = 0;
  const keys = [];
  await assert.rejects(runWithRetry(async ({ idempotencyKey }) => {
    calls++;
    keys.push(idempotencyKey);
    throw Object.assign(new Error("temporary"), { code: "ETIMEDOUT" });
  }, {
    sideEffecting: true,
    idempotencyKey: "ix1_stable-key",
    policy: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2, maxElapsedMs: 100 },
    random: () => 0,
    wait: async () => {},
    monotonicNow: () => 0,
  }));
  assert.equal(calls, 3);
  assert.deepEqual(keys, ["ix1_stable-key", "ix1_stable-key", "ix1_stable-key"]);
});

test("elapsed budget and abort stop further attempts", async () => {
  let clock = 0;
  let calls = 0;
  await assert.rejects(runWithRetry(async () => {
    calls++;
    clock += 20;
    throw Object.assign(new Error("temporary"), { status: 503 });
  }, {
    policy: { maxAttempts: 5, baseDelayMs: 1, maxDelayMs: 1, maxElapsedMs: 10 },
    random: () => 0, wait: async () => {}, monotonicNow: () => clock,
  }));
  assert.equal(calls, 1);
  const controller = new AbortController();
  controller.abort(new Error("cancelled"));
  await assert.rejects(runWithRetry(async () => assert.fail("must not execute"), {
    signal: controller.signal,
  }));
});
