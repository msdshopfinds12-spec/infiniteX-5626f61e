/** Pure retry decision policy. No I/O, timers, persistence, or implicit retries. */

export const RETRYABLE_ERROR_CODES = Object.freeze([
  "network_timeout",
  "rate_limited",
  "upstream_5xx",
  "worker_capacity_exhausted",
]);

const RETRYABLE = new Set(RETRYABLE_ERROR_CODES);

function integerInRange(value, label, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(label + "_out_of_range");
  }
  return value;
}

/**
 * retryLimit means additional retries after the initial execution.
 * retriesUsed is the number of retries already consumed (0 before first retry).
 * Unknown errors fail closed and are never retried.
 *
 * Full jitter uses the half-open interval [0, exponentialCeiling):
 * delay = floor(random() * min(maxDelay, baseDelay * 2^retriesUsed)).
 */
export function decideRetry({
  errorCode,
  retryLimit,
  retriesUsed,
  firstAttemptAtMs,
  nowMs,
  baseDelayMs = 1_000,
  maxDelayMs = 60_000,
  maxElapsedMs = 15 * 60_000,
  random = Math.random,
}) {
  integerInRange(retryLimit, "retry_limit", 0, 100);
  integerInRange(retriesUsed, "retries_used", 0, 100);
  integerInRange(firstAttemptAtMs, "first_attempt_at_ms", 0, Number.MAX_SAFE_INTEGER);
  integerInRange(nowMs, "now_ms", firstAttemptAtMs, Number.MAX_SAFE_INTEGER);
  integerInRange(baseDelayMs, "base_delay_ms", 1, 60 * 60_000);
  integerInRange(maxDelayMs, "max_delay_ms", baseDelayMs, 24 * 60 * 60_000);
  integerInRange(maxElapsedMs, "max_elapsed_ms", 1, 7 * 24 * 60 * 60_000);

  // Resolve deterministic terminal states before consulting randomness.
  if (!RETRYABLE.has(errorCode)) {
    return { retry: false, reason: "non_retryable_error", retriesUsed };
  }
  if (retriesUsed >= retryLimit) {
    return { retry: false, reason: "retry_limit_exhausted", retriesUsed };
  }

  const elapsedMs = nowMs - firstAttemptAtMs;
  if (elapsedMs >= maxElapsedMs) {
    return { retry: false, reason: "max_elapsed_exceeded", retriesUsed };
  }

  // Randomness is required only when a retry is otherwise eligible.
  if (typeof random !== "function") {
    throw new Error("random_must_be_function");
  }

  const randomValue = random();
  if (
    typeof randomValue !== "number" ||
    !Number.isFinite(randomValue) ||
    randomValue < 0 ||
    randomValue >= 1
  ) {
    throw new Error("random_out_of_range");
  }

  const exponent = Math.min(retriesUsed, 30);
  const exponentialCeiling = Math.min(maxDelayMs, baseDelayMs * (2 ** exponent));
  const delayMs = Math.floor(randomValue * exponentialCeiling);

  if (elapsedMs + delayMs > maxElapsedMs) {
    return { retry: false, reason: "max_elapsed_would_be_exceeded", retriesUsed };
  }

  return {
    retry: true,
    reason: "retryable_transient_error",
    retriesUsed,
    nextRetriesUsed: retriesUsed + 1,
    delayMs,
    elapsedMs,
  };
}
