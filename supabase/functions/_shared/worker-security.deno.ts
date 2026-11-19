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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function assertJsonEqual(actual: unknown, expected: unknown, message: string) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}

const validRun = { id: "run-a", workflow_id: "workflow-a", owner_id: "user-a" };

Deno.test("Deno: validates claimed run shape", () => {
  assert(isClaimedRunValid(validRun), "valid run should pass");
  for (const value of [null, [], {}, { ...validRun, owner_id: "" }, { ...validRun, id: 7 }]) {
    assert(!isClaimedRunValid(value), "malformed run should fail");
  }
});

Deno.test("Deno: binds claimed runs and parent workflows to the same owner", () => {
  assert(isClaimedRunOwnedBy(validRun, "user-a"), "matching run owner should pass");
  assert(!isClaimedRunOwnedBy(validRun, "user-b"), "cross-owner run should fail");
  const workflow = { id: "workflow-a", owner_id: "user-a" };
  assert(isWorkflowOwnedBy(workflow, "workflow-a", "user-a"), "matching workflow should pass");
  assert(!isWorkflowOwnedBy(workflow, "workflow-a", "user-b"), "cross-owner workflow should fail");
  assert(!isWorkflowOwnedBy(workflow, "workflow-b", "user-a"), "wrong workflow id should fail");
});

Deno.test("Deno: clamps queue batch limits", () => {
  assert(clampBatchLimit(undefined) === 3, "default should be 3");
  assert(clampBatchLimit(0) === 1, "minimum should be 1");
  assert(clampBatchLimit(999) === 5, "maximum should be 5");
  assert(clampBatchLimit(2.5) === 3, "fraction should use fallback");
});

Deno.test("Deno: enforces actual streamed request bytes without Content-Length", async () => {
  const valid = new Request("https://example.test", {
    method: "POST",
    body: JSON.stringify({ limit: 2 }),
  });
  assertJsonEqual(await readJsonBodyLimited(valid, 64), {
    ok: true,
    value: { limit: 2 },
  }, "valid JSON should parse");

  const oversized = new Request("https://example.test", {
    method: "POST",
    body: JSON.stringify({ payload: "x".repeat(128) }),
  });
  assertJsonEqual(await readJsonBodyLimited(oversized, 32), {
    ok: false,
    reason: "payload_too_large",
  }, "oversized body should be rejected");
});

Deno.test("Deno: rejects malformed JSON and accepts an empty request body", async () => {
  const malformed = new Request("https://example.test", { method: "POST", body: "{" });
  const empty = new Request("https://example.test", { method: "POST" });
  assertJsonEqual(await readJsonBodyLimited(malformed, 32), {
    ok: false,
    reason: "invalid_json",
  }, "malformed JSON should fail");
  assertJsonEqual(await readJsonBodyLimited(empty, 32), {
    ok: true,
    value: null,
  }, "empty body should be accepted");
});


Deno.test("Deno: validates bounded step timeout configuration", () => {
  assert(validateStepTimeoutSeconds(1) === 1, "minimum timeout should pass");
  assert(validateStepTimeoutSeconds(60) === 60, "maximum timeout should pass");
  for (const value of [undefined, null, 0, -1, 1.5, 61, "5"]) {
    let rejected = false;
    try { validateStepTimeoutSeconds(value); } catch { rejected = true; }
    assert(rejected, "invalid timeout must fail closed");
  }
});

Deno.test("Deno: detects cooperative deadline overruns", () => {
  let clock = 0;
  const deadline = createStepDeadline(1, () => clock);
  assert(deadline === 1000, "deadline should be one second after start");
  clock = 1001;
  let rejected = false;
  try { assertStepDeadline(deadline, () => clock); } catch { rejected = true; }
  assert(rejected, "expired deadline must fail");
});

Deno.test("Deno: bounds step input and output JSON payloads", () => {
  let inputRejected = false;
  try {
    executeWithinStepBudget((value: unknown) => value, { payload: "x".repeat(100) }, 5, 32);
  } catch { inputRejected = true; }
  assert(inputRejected, "oversized input must fail");
  let outputRejected = false;
  try {
    executeWithinStepBudget(() => ({ payload: "x".repeat(100) }), {}, 5, 32);
  } catch { outputRejected = true; }
  assert(outputRejected, "oversized output must fail");
  assert(assertJsonByteLimit({ ok: true }, 32) === 11, "UTF-8 JSON byte count should match");
});

Deno.test("Deno: detects synchronous overrun after bounded action returns", () => {
  let clock = 0;
  let rejected = false;
  try {
    executeWithinStepBudget(() => { clock = 1001; return { ok: true }; }, {}, 1, 1024, () => clock);
  } catch { rejected = true; }
  assert(rejected, "overrun must fail after action returns");
});
