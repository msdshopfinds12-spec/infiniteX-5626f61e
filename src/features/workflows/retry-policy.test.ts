import assert from "node:assert/strict";
import test from "node:test";
import {
  assertStepStatusTransition,
  canTransitionStepStatus,
  decideStepRetry,
} from "./retry-policy.ts";

test("retry_limit counts retries after the initial attempt", () => {
  const firstFailure = decideStepRetry({
    attemptNumber: 1,
    retryLimit: 1,
    failureKind: "transient",
    nowMs: 10_000,
    jitterRatio: 0,
  });

  assert.deepEqual(firstFailure, {
    kind: "retry",
    failedAttemptNumber: 1,
    nextAttemptNumber: 2,
    delayMs: 1_000,
    scheduledAtMs: 11_000,
  });

  const secondFailure = decideStepRetry({
    attemptNumber: 2,
    retryLimit: 1,
    failureKind: "transient",
    nowMs: 12_000,
    jitterRatio: 0,
  });

  assert.deepEqual(secondFailure, {
    kind: "exhausted",
    failedAttemptNumber: 2,
    totalAllowedAttempts: 2,
  });
});

test("zero retry limit allows only the initial attempt", () => {
  assert.deepEqual(decideStepRetry({
    attemptNumber: 1,
    retryLimit: 0,
    failureKind: "transient",
    nowMs: 0,
  }), {
    kind: "exhausted",
    failedAttemptNumber: 1,
    totalAllowedAttempts: 1,
  });
});

test("permanent and cancelled failures are never retried", () => {
  for (const failureKind of ["permanent", "cancelled"] as const) {
    assert.deepEqual(decideStepRetry({
      attemptNumber: 1,
      retryLimit: 10,
      failureKind,
      nowMs: 100,
    }), {
      kind: "not_retryable",
      failedAttemptNumber: 1,
      failureKind,
    });
  }
});

test("exponential delay grows and is capped", () => {
  const delays = [1, 2, 3, 4, 5].map((attemptNumber) => {
    const result = decideStepRetry({
      attemptNumber,
      retryLimit: 10,
      failureKind: "transient",
      nowMs: 0,
      baseDelayMs: 1_000,
      maxDelayMs: 4_000,
      jitterRatio: 0,
    });
    assert.equal(result.kind, "retry");
    return result.delayMs;
  });

  assert.deepEqual(delays, [1_000, 2_000, 4_000, 4_000, 4_000]);
});

test("jitter is bounded and deterministic with an injected random source", () => {
  const low = decideStepRetry({
    attemptNumber: 1,
    retryLimit: 2,
    failureKind: "transient",
    nowMs: 5_000,
    jitterRatio: 0.2,
    random: () => 0,
  });
  const high = decideStepRetry({
    attemptNumber: 1,
    retryLimit: 2,
    failureKind: "transient",
    nowMs: 5_000,
    jitterRatio: 0.2,
    random: () => 1,
  });

  assert.equal(low.kind, "retry");
  assert.equal(high.kind, "retry");
  if (low.kind === "retry" && high.kind === "retry") {
    assert.equal(low.delayMs, 800);
    assert.equal(high.delayMs, 1_200);
    assert.equal(low.scheduledAtMs, 5_800);
    assert.equal(high.scheduledAtMs, 6_200);
  }
});

test("jitter never allows the delay to exceed the configured maximum", () => {
  const result = decideStepRetry({
    attemptNumber: 8,
    retryLimit: 10,
    failureKind: "transient",
    nowMs: 0,
    baseDelayMs: 1_000,
    maxDelayMs: 5_000,
    jitterRatio: 1,
    random: () => 1,
  });

  assert.equal(result.kind, "retry");
  if (result.kind === "retry") assert.equal(result.delayMs, 5_000);
});

test("invalid attempt, retry, clock, delay and jitter values fail closed", () => {
  const base = {
    attemptNumber: 1,
    retryLimit: 2,
    failureKind: "transient" as const,
    nowMs: 0,
  };

  for (const patch of [
    { attemptNumber: 0 },
    { attemptNumber: 1.5 },
    { retryLimit: -1 },
    { retryLimit: 11 },
    { nowMs: -1 },
    { baseDelayMs: 0 },
    { maxDelayMs: 0 },
    { baseDelayMs: 2_000, maxDelayMs: 1_000 },
    { jitterRatio: -0.1 },
    { jitterRatio: 1.1 },
    { random: "not-a-function" },
    { failureKind: "unknown" },
    { random: () => Number.NaN },
    { random: () => 1.1 },
  ]) {
    assert.throws(() => decideStepRetry({ ...base, ...patch } as Parameters<typeof decideStepRetry>[0]));
  }
});

test("retry scheduling rejects timestamp overflow", () => {
  assert.throws(() => decideStepRetry({
    attemptNumber: 1,
    retryLimit: 1,
    failureKind: "transient",
    nowMs: Number.MAX_SAFE_INTEGER,
    jitterRatio: 0,
  }), /scheduled_at_ms_overflow/);
});

test("step summary state machine allows only documented transitions", () => {
  assert.equal(canTransitionStepStatus("queued", "running"), true);
  assert.equal(canTransitionStepStatus("running", "succeeded"), true);
  assert.equal(canTransitionStepStatus("running", "failed"), true);
  assert.equal(canTransitionStepStatus("failed", "queued"), true);
  assert.equal(canTransitionStepStatus("succeeded", "queued"), false);
  assert.equal(canTransitionStepStatus("skipped", "running"), false);
  assert.equal(canTransitionStepStatus("queued", "succeeded"), false);
  assert.equal(canTransitionStepStatus("unknown" as StepSummaryStatus, "running"), false);
  assert.equal(canTransitionStepStatus("queued", "unknown" as StepSummaryStatus), false);

  assert.throws(
    () => assertStepStatusTransition("succeeded", "queued"),
    /invalid_step_status_transition/,
  );
});
