import test from "node:test";
import assert from "node:assert/strict";
import { decideRetry, RETRYABLE_ERROR_CODES } from "./workflow-retry-policy.mjs";

const base = {
  errorCode: "network_timeout",
  retryLimit: 3,
  retriesUsed: 0,
  firstAttemptAtMs: 1_000,
  nowMs: 1_000,
  random: () => 0.5,
};

test("allows only explicitly classified transient errors", () => {
  assert.deepEqual(RETRYABLE_ERROR_CODES, [
    "network_timeout", "rate_limited", "upstream_5xx", "worker_capacity_exhausted",
  ]);
  assert.equal(decideRetry({ ...base, errorCode: "validation_error" }).reason, "non_retryable_error");
  assert.equal(decideRetry({ ...base, errorCode: "unknown_error" }).retry, false);
});

test("uses bounded exponential full jitter and increments retry count", () => {
  const first = decideRetry(base);
  assert.equal(first.retry, true);
  assert.equal(first.delayMs, 500);
  assert.equal(first.nextRetriesUsed, 1);

  const second = decideRetry({ ...base, retriesUsed: 1 });
  assert.equal(second.delayMs, 1_000);
});

test("stops when retry limit is exhausted", () => {
  const result = decideRetry({ ...base, retriesUsed: 3 });
  assert.equal(result.retry, false);
  assert.equal(result.reason, "retry_limit_exhausted");
});

test("stops when elapsed-time budget is exhausted or next delay exceeds it", () => {
  assert.equal(
    decideRetry({ ...base, nowMs: 16 * 60_000 }).reason,
    "max_elapsed_exceeded",
  );
  assert.equal(
    decideRetry({ ...base, maxElapsedMs: 100, random: () => 0.99 }).reason,
    "max_elapsed_would_be_exceeded",
  );
});

test("rejects invalid policy inputs and random sources", () => {
  assert.throws(() => decideRetry({ ...base, retryLimit: -1 }), /retry_limit_out_of_range/);
  assert.throws(() => decideRetry({ ...base, retriesUsed: 1.5 }), /retries_used_out_of_range/);
  assert.throws(() => decideRetry({ ...base, random: () => 1 }), /random_out_of_range/);
  assert.throws(() => decideRetry({ ...base, nowMs: 999 }), /now_ms_out_of_range/);
});

test("does not mutate caller input", () => {
  const input = { ...base };
  decideRetry(input);
  assert.deepEqual(input, base);
});
