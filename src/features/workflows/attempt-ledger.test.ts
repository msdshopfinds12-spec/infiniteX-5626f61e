import assert from "node:assert/strict";
import test from "node:test";
import {
  cancelStepAttempt,
  canonicalStepAttemptIdempotencyKey,
  claimStepAttempt,
  createQueuedStepAttempt,
  finishStepAttempt,
  heartbeatStepAttempt,
  planNextStepAttempt,
  StepAttemptDomainError,
} from "./attempt-ledger.ts";

function queued(overrides: Record<string, unknown> = {}) {
  return createQueuedStepAttempt({
    id: "attempt-1",
    runId: "run-1",
    stepId: "step-1",
    ownerId: "owner-1",
    attemptNumber: 1,
    idempotencyKey: "run-1:step-1:attempt:1",
    requestFingerprint: "sha256:synthetic-fingerprint",
    scheduledAtMs: 1_000,
    ...overrides,
  });
}

function claimed() {
  return claimStepAttempt(queued(), {
    nowMs: 1_000,
    leaseDurationMs: 500,
    nextLeaseGeneration: 1,
  });
}

test("creates a queued attempt with independent run, step and lease counters", () => {
  const attempt = queued();
  assert.equal(attempt.status, "queued");
  assert.equal(attempt.attemptNumber, 1);
  assert.equal(attempt.leaseGeneration, 0);
  assert.equal(attempt.startedAtMs, null);
  assert.equal(attempt.finishedAtMs, null);
});

test("rejects invalid identity, attempt number, and timestamps", () => {
  for (const patch of [
    { id: "" },
    { ownerId: " " },
    { attemptNumber: 0 },
    { attemptNumber: 1.2 },
    { scheduledAtMs: -1 },
    { idempotencyKey: "x".repeat(257) },
  ]) {
    assert.throws(() => queued(patch), StepAttemptDomainError);
  }
});

test("claim requires due time and exactly the next fencing generation", () => {
  assert.throws(
    () => claimStepAttempt(queued(), { nowMs: 999, leaseDurationMs: 500, nextLeaseGeneration: 1 }),
    /attempt_not_due/,
  );
  assert.throws(
    () => claimStepAttempt(queued(), { nowMs: 1_000, leaseDurationMs: 500, nextLeaseGeneration: 2 }),
    /lease_generation_conflict/,
  );
  const active = claimed();
  assert.equal(active.status, "running");
  assert.equal(active.leaseGeneration, 1);
  assert.equal(active.leaseExpiresAtMs, 1_500);
});

test("lease heartbeat extends expiry without changing fencing generation", () => {
  const active = claimed();
  const renewed = heartbeatStepAttempt(active, {
    nowMs: 1_200,
    expectedLeaseGeneration: 1,
    leaseDurationMs: 800,
  });
  assert.equal(renewed.leaseGeneration, 1);
  assert.equal(renewed.heartbeatAtMs, 1_200);
  assert.equal(renewed.leaseExpiresAtMs, 2_000);
});

test("stale generation and expired lease cannot heartbeat or complete", () => {
  const active = claimed();
  assert.throws(
    () => heartbeatStepAttempt(active, { nowMs: 1_100, expectedLeaseGeneration: 2, leaseDurationMs: 500 }),
    /stale_or_expired_lease/,
  );
  assert.throws(
    () => finishStepAttempt(active, { nowMs: 1_500, expectedLeaseGeneration: 1, outcome: "succeeded" }),
    /stale_or_expired_lease/,
  );
});

test("successful completion stores a detached deeply immutable JSON snapshot", () => {
  const active = claimed();
  const output = { result: "synthetic", nested: { values: [1, 2] } };
  const done = finishStepAttempt(active, {
    nowMs: 1_100,
    expectedLeaseGeneration: 1,
    outcome: "succeeded",
    output,
  });
  assert.equal(done.status, "succeeded");
  assert.equal(done.finishedAtMs, 1_100);
  assert.equal(done.leaseExpiresAtMs, null);
  assert.notEqual(done.output, output);
  assert.deepEqual(done.output, output);
  assert.equal(Object.isFrozen(done.output), true);
  assert.equal(Object.isFrozen((done.output as { nested: object }).nested), true);
  assert.equal(Object.isFrozen((done.output as { nested: { values: unknown[] } }).nested.values), true);
  output.nested.values.push(3);
  assert.deepEqual(done.output, { result: "synthetic", nested: { values: [1, 2] } });
  assert.throws(
    () => finishStepAttempt(done, { nowMs: 1_200, expectedLeaseGeneration: 1, outcome: "succeeded" }),
    /terminal_attempt_immutable/,
  );
});

test("failed completion requires an explicit failure class and bounded safe error code", () => {
  const active = claimed();
  assert.throws(
    () => finishStepAttempt(active, { nowMs: 1_100, expectedLeaseGeneration: 1, outcome: "failed" }),
    /failure_kind_required/,
  );
  assert.throws(
    () => finishStepAttempt(active, {
      nowMs: 1_100, expectedLeaseGeneration: 1, outcome: "failed",
      failureKind: "transient", errorCode: "raw token: secret",
    }),
    /error_code_invalid/,
  );
  const failed = finishStepAttempt(active, {
    nowMs: 1_100, expectedLeaseGeneration: 1, outcome: "failed",
    failureKind: "transient", errorCode: "provider_timeout",
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.failureKind, "transient");
  assert.equal(failed.errorCode, "provider_timeout");
});

test("retry creates a new queued attempt and never reopens the failed attempt", () => {
  const failed = finishStepAttempt(claimed(), {
    nowMs: 1_100,
    expectedLeaseGeneration: 1,
    outcome: "failed",
    failureKind: "transient",
    errorCode: "temporary_unavailable",
  });
  const plan = planNextStepAttempt({
    failedAttempt: failed,
    nextAttemptId: "attempt-2",
    retryLimit: 1,
    nowMs: 2_000,
    jitterRatio: 0,
  });
  assert.equal(plan.kind, "retry");
  if (plan.kind === "retry") {
    assert.equal(plan.failedAttempt.status, "failed");
    assert.equal(plan.nextAttempt.status, "queued");
    assert.equal(plan.nextAttempt.attemptNumber, 2);
    assert.equal(plan.nextAttempt.leaseGeneration, 1);
    assert.equal(plan.nextAttempt.scheduledAtMs, 3_000);
    assert.equal(plan.nextAttempt.idempotencyKey, "step-attempt:v1:run-1:step-1:2");
  }
});

test("retry limit counts retries after initial execution", () => {
  const failed = finishStepAttempt(claimed(), {
    nowMs: 1_100, expectedLeaseGeneration: 1, outcome: "failed", failureKind: "transient",
  });
  const plan = planNextStepAttempt({
    failedAttempt: failed, nextAttemptId: "attempt-2", retryLimit: 0, nowMs: 2_000,
  });
  assert.deepEqual(plan, { kind: "exhausted", failedAttempt: failed, totalAllowedAttempts: 1 });
});

test("permanent and cancelled failures never create retries", () => {
  const active = claimed();
  for (const failureKind of ["permanent", "cancelled"] as const) {
    const failed = finishStepAttempt(active, {
      nowMs: 1_100, expectedLeaseGeneration: 1, outcome: "failed", failureKind,
    });
    const plan = planNextStepAttempt({
      failedAttempt: failed, nextAttemptId: "never-used", retryLimit: 10, nowMs: 2_000,
    });
    assert.equal(plan.kind, "not_retryable");
  }
});

test("queued and running cancellation are terminal and generation-fenced", () => {
  const cancelledQueued = cancelStepAttempt(queued(), { nowMs: 1_100, expectedLeaseGeneration: 0 });
  assert.equal(cancelledQueued.status, "cancelled");
  assert.equal(cancelledQueued.finishedAtMs, 1_100);
  const active = claimed();
  assert.throws(
    () => cancelStepAttempt(active, { nowMs: 1_100, expectedLeaseGeneration: 2 }),
    /lease_generation_conflict/,
  );
  const cancelledRunning = cancelStepAttempt(active, { nowMs: 1_100, expectedLeaseGeneration: 1 });
  assert.equal(cancelledRunning.status, "cancelled");
  assert.equal(cancelledRunning.leaseExpiresAtMs, null);
});

test("domain operations do not mutate the source attempt", () => {
  const original = queued();
  const snapshot = { ...original };
  claimStepAttempt(original, { nowMs: 1_000, leaseDurationMs: 500, nextLeaseGeneration: 1 });
  assert.deepEqual(original, snapshot);
});

test("lease expiry arithmetic rejects unsafe integer overflow", () => {
  assert.throws(
    () => claimStepAttempt(queued(), {
      nowMs: Number.MAX_SAFE_INTEGER,
      leaseDurationMs: 2,
      nextLeaseGeneration: 1,
    }),
    /lease_expiry_overflow/,
  );
});


test("canonical retry idempotency keys are stable, versioned, and unambiguous", () => {
  const first = canonicalStepAttemptIdempotencyKey("run:a", "step/b", 2);
  const same = canonicalStepAttemptIdempotencyKey("run:a", "step/b", 2);
  const differentAttempt = canonicalStepAttemptIdempotencyKey("run:a", "step/b", 3);
  assert.equal(first, same);
  assert.notEqual(first, differentAttempt);
  assert.match(first, /^step-attempt:v1:/);
});

test("heartbeat and completion timestamps cannot move backwards", () => {
  const active = claimed();
  assert.throws(
    () => heartbeatStepAttempt(active, {
      nowMs: 999, expectedLeaseGeneration: 1, leaseDurationMs: 500,
    }),
    /timestamp_regression/,
  );
  const laterHeartbeat = heartbeatStepAttempt(active, {
    nowMs: 1_200, expectedLeaseGeneration: 1, leaseDurationMs: 500,
  });
  assert.throws(
    () => finishStepAttempt(laterHeartbeat, {
      nowMs: 1_100, expectedLeaseGeneration: 1, outcome: "succeeded",
    }),
    /timestamp_regression/,
  );
});

test("cancellation timestamp cannot precede the attempt lifecycle", () => {
  assert.throws(
    () => cancelStepAttempt(queued(), { nowMs: 999, expectedLeaseGeneration: 0 }),
    /timestamp_regression/,
  );
  assert.throws(
    () => cancelStepAttempt(claimed(), { nowMs: 999, expectedLeaseGeneration: 1 }),
    /timestamp_regression/,
  );
});

test("malformed, executable, cyclic, and exotic output values fail closed", () => {
  const active = claimed();
  const invalidOutputs: unknown[] = [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    BigInt(1),
    () => "not-json",
    new Date(0),
  ];
  for (const output of invalidOutputs) {
    assert.throws(
      () => finishStepAttempt(active, {
        nowMs: 1_100, expectedLeaseGeneration: 1, outcome: "succeeded", output,
      }),
      StepAttemptDomainError,
    );
  }

  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  assert.throws(
    () => finishStepAttempt(active, {
      nowMs: 1_100, expectedLeaseGeneration: 1, outcome: "succeeded", output: cyclic,
    }),
    /output_cycle_detected/,
  );

  const accessor = Object.defineProperty({}, "secret", {
    enumerable: true,
    get() { throw new Error("getter must not execute"); },
  });
  assert.throws(
    () => finishStepAttempt(active, {
      nowMs: 1_100, expectedLeaseGeneration: 1, outcome: "succeeded", output: accessor,
    }),
    /output_accessor_invalid/,
  );
});

test("oversized, deeply nested, and sparse output payloads are rejected", () => {
  const active = claimed();
  assert.throws(
    () => finishStepAttempt(active, {
      nowMs: 1_100, expectedLeaseGeneration: 1, outcome: "succeeded",
      output: "x".repeat(65 * 1024),
    }),
    /output_size_limit_exceeded/,
  );

  let deeplyNested: unknown = "leaf";
  for (let index = 0; index < 22; index += 1) deeplyNested = { child: deeplyNested };
  assert.throws(
    () => finishStepAttempt(active, {
      nowMs: 1_100, expectedLeaseGeneration: 1, outcome: "succeeded", output: deeplyNested,
    }),
    /output_depth_limit_exceeded/,
  );

  const sparse = new Array(2);
  sparse[1] = "value";
  assert.throws(
    () => finishStepAttempt(active, {
      nowMs: 1_100, expectedLeaseGeneration: 1, outcome: "succeeded", output: sparse,
    }),
    /output_sparse_array_invalid/,
  );
});
