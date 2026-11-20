import { executeSafeAction } from "./workflow-actions.mjs";
import {
  assertJsonByteLimit,
  assertStepDeadline,
  clampBatchLimit,
  createStepDeadline,
  executeWithinStepBudget,
  isClaimedRunOwnedBy,
  isClaimedRunValid,
  isValidAttempt,
  isAttemptGenerationNewer,
  isWorkflowOwnedBy,
  readJsonBodyLimited,
  validateStepTimeoutSeconds,
  validateRetryLimit,
  executeWithRetry,
} from "./worker-security.mjs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function assertEqual(actual: unknown, expected: unknown, message: string) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}

const validRun = { id: "run-a", workflow_id: "workflow-a", owner_id: "user-a", attempt: 1 };

Deno.test("Deno: validates claimed run shape and owner binding", () => {
  assert(isClaimedRunValid(validRun), "valid run should pass");
  assert(!isClaimedRunValid(null), "null run should fail");
  assert(!isClaimedRunValid([]), "array run should fail");
  assert(!isClaimedRunValid({ ...validRun, attempt: 0 }), "zero attempt should fail");
  assert(!isClaimedRunValid({ ...validRun, attempt: 1.5 }), "fractional attempt should fail");
  assert(isValidAttempt(1), "positive integer attempt should pass");
  assert(!isValidAttempt(-1), "negative attempt should fail");
  assert(isClaimedRunOwnedBy(validRun, "user-a"), "matching owner should pass");
  assert(!isClaimedRunOwnedBy(validRun, "user-b"), "mismatched owner should fail");
  const workflow = { id: "workflow-a", owner_id: "user-a" };
  assert(isWorkflowOwnedBy(workflow, "workflow-a", "user-a"), "workflow owner should pass");
  assert(!isWorkflowOwnedBy(workflow, "workflow-a", "user-b"), "cross-tenant workflow should fail");
});

Deno.test("Deno: clamps batch limits and validates timeout policy", () => {
  assert(clampBatchLimit(undefined) === 3, "default batch should be 3");
  assert(clampBatchLimit(999) === 5, "batch maximum should be 5");
  assert(validateStepTimeoutSeconds(undefined) === 30, "timeout default should be 30 seconds");
  assert(validateStepTimeoutSeconds(5) === 5, "valid timeout should pass");
  let rejected = false;
  try { validateStepTimeoutSeconds(301); } catch { rejected = true; }
  assert(rejected, "excessive timeout should fail closed");
});

Deno.test("Deno: enforces monotonic deadline and UTF-8 payload limits", () => {
  const deadline = createStepDeadline(1, 50);
  assert(deadline === 1050, "deadline should use monotonic milliseconds");
  assertStepDeadline(deadline, 1049);
  let timedOut = false;
  try { assertStepDeadline(deadline, 1050); } catch { timedOut = true; }
  assert(timedOut, "expired deadline should fail");
  assert(assertJsonByteLimit({ ok: true }, 32) > 0, "small payload should pass");
  let oversized = false;
  try { assertJsonByteLimit({ text: "é".repeat(20) }, 32); } catch { oversized = true; }
  assert(oversized, "oversized UTF-8 payload should fail");
});

Deno.test("Deno: enforces actual streamed request bytes and parses JSON", async () => {
  const valid = new Request("https://example.test", {
    method: "POST", body: JSON.stringify({ limit: 2 }),
  });
  assertEqual(await readJsonBodyLimited(valid, 64), {
    ok: true, value: { limit: 2 },
  }, "valid JSON should parse");
  const oversized = new Request("https://example.test", {
    method: "POST", body: JSON.stringify({ payload: "x".repeat(128) }),
  });
  assertEqual(await readJsonBodyLimited(oversized, 32), {
    ok: false, reason: "payload_too_large",
  }, "oversized body should fail");
});

Deno.test("Deno: rejects malformed JSON and accepts empty bodies", async () => {
  const malformed = new Request("https://example.test", { method: "POST", body: "{" });
  const empty = new Request("https://example.test", { method: "POST" });
  assertEqual(await readJsonBodyLimited(malformed, 32), {
    ok: false, reason: "invalid_json",
  }, "malformed JSON should fail");
  assertEqual(await readJsonBodyLimited(empty, 32), {
    ok: true, value: null,
  }, "empty body should be accepted");
});


Deno.test("Deno: executes bounded local actions once and checks the deadline after execution", () => {
  let calls = 0;
  const output = executeWithinStepBudget(
    () => { calls++; return { ok: true }; },
    { input: 1 },
    2,
    64,
    () => 100,
  );
  assertEqual(output, { ok: true }, "action output should be returned");
  assert(calls === 1, "deterministic local action should execute once");

  const times = [100, 100, 2100];
  let index = 0;
  let timedOut = false;
  try {
    executeWithinStepBudget(() => ({ ok: true }), {}, 2, 64, () => times[index++]);
  } catch {
    timedOut = true;
  }
  assert(timedOut, "deadline exceeded during action should be reported after execution");
});

Deno.test("Deno: attempt generations advance strictly and reject stale writers", () => {
  assert(isAttemptGenerationNewer(1, 2), "newer generation should be accepted");
  assert(!isAttemptGenerationNewer(2, 2), "same generation should not reacquire");
  assert(!isAttemptGenerationNewer(3, 2), "stale generation should be rejected");
  assert(!isAttemptGenerationNewer(0, 1), "invalid stored generation should fail closed");
  assert(!isAttemptGenerationNewer(1, 0), "invalid candidate generation should fail closed");

  const state = { attempt: 1, output: null as string | null };
  const apply = (attempt: number, output: string) => {
    if (!isValidAttempt(attempt) || state.attempt > attempt ||
      (state.attempt === attempt && state.output !== null)) return false;
    state.attempt = attempt;
    state.output = output;
    return true;
  };
  assert(apply(2, "new-result"), "new generation should commit");
  assert(!apply(1, "stale-result"), "late stale completion should be rejected");
  assertEqual(state, { attempt: 2, output: "new-result" }, "stale completion must not overwrite new result");
});

Deno.test("Deno: validates bounded retry configuration and retries only transient failures", async () => {
  assert(validateRetryLimit(0) === 0, "zero retries should be valid");
  assert(validateRetryLimit(10) === 10, "database-aligned retry cap should be valid");
  let invalid = false;
  try { validateRetryLimit(11); } catch { invalid = true; }
  assert(invalid, "retry limit above database cap should fail closed");

  let calls = 0;
  const delays: number[] = [];
  const result = await executeWithRetry(async () => {
    calls++;
    if (calls === 1) throw Object.assign(new Error("temporary"), { code: "UPSTREAM_UNAVAILABLE" });
    return "ok";
  }, 1, {
    baseDelayMs: 10,
    maxDelayMs: 10,
    random: () => 1,
    sleep: async (ms: number) => { delays.push(ms); },
  });
  assert(result === "ok" && calls === 2, "one transient failure should retry once");
  assertEqual(delays, [10], "backoff should be deterministic with injected randomness");
});

Deno.test("Deno: shared safe action executor rejects unsupported and malformed actions", () => {
  assertEqual(executeSafeAction("uppercase_text", { text: "hello" }, {}), { text: "HELLO" },
    "uppercase action should transform text");
  let rejected = false;
  try { executeSafeAction("delete_everything", {}, {}); } catch { rejected = true; }
  assert(rejected, "unknown actions must fail closed");
});
