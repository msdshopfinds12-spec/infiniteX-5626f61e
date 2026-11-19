import {
  assertIdempotencyKey, buildIdempotencyKey, classifyRetryError,
  computeRetryDelayMs, runWithRetry, validateRetryPolicy,
} from "./retry-reliability.mjs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("Deno: validates bounded retry policy", () => {
  assert(validateRetryPolicy().maxAttempts === 3, "default attempts");
  let rejected = false;
  try { validateRetryPolicy({ maxAttempts: 11 }); } catch { rejected = true; }
  assert(rejected, "excessive attempts must fail closed");
});
Deno.test("Deno: classifies transient and permanent errors", () => {
  assert(classifyRetryError(Object.assign(new Error("busy"), { status: 503 })) === "retryable", "503 retryable");
  assert(classifyRetryError(Object.assign(new Error("invalid"), { status: 400 })) === "permanent", "400 permanent");
  assert(classifyRetryError(Object.assign(new Error("abort"), { name: "AbortError", status: 503 })) === "permanent", "abort permanent");
});
Deno.test("Deno: computes capped full jitter", () => {
  const policy = { maxAttempts: 4, baseDelayMs: 100, maxDelayMs: 250, maxElapsedMs: 1000 };
  assert(computeRetryDelayMs(2, policy, () => 0.5) === 100, "jitter sample");
  assert(computeRetryDelayMs(3, policy, () => 0.99) === 250, "delay cap");
});
Deno.test("Deno: retries transient failures within attempt budget", async () => {
  let calls = 0;
  const result = await runWithRetry(async ({ attempt }) => {
    calls++;
    if (attempt === 1) throw Object.assign(new Error("temporary"), { status: 503 });
    return "ok";
  }, { random: () => 0, wait: async () => {}, monotonicNow: () => 0 });
  assert(result === "ok" && calls === 2, "transient retry should succeed");
});
Deno.test("Deno: permanent errors and missing idempotency keys do not retry", async () => {
  let calls = 0;
  try {
    await runWithRetry(async () => {
      calls++;
      throw Object.assign(new Error("invalid"), { status: 400 });
    }, { wait: async () => { throw new Error("must not wait"); } });
  } catch { /* expected */ }
  assert(calls === 1, "permanent error called once");
  let sideEffectCalled = false;
  try { await runWithRetry(async () => { sideEffectCalled = true; }, { sideEffecting: true }); }
  catch { /* expected */ }
  assert(!sideEffectCalled, "side effect must fail closed without key");
  assertIdempotencyKey("ix1_stable-key");
});
Deno.test("Deno: idempotency key is stable and opaque", async () => {
  const first = await buildIdempotencyKey({ runId: "run-a", stepId: "step-a" });
  const second = await buildIdempotencyKey({ runId: "run-a", stepId: "step-a" });
  assert(first === second && /^ix1_[a-f0-9]{64}$/.test(first), "stable opaque key");
});
