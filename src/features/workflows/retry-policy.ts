/**
 * Pure workflow-step retry domain rules.
 *
 * This module deliberately performs no I/O and does not mutate persistence.
 * attemptNumber is the 1-based logical step attempt that just failed.
 * retryLimit is the number of retries permitted after the initial attempt.
 * Therefore total allowed attempts = 1 + retryLimit.
 */

export type RetryFailureKind = "transient" | "permanent" | "cancelled";

export type StepRetryDecision =
  | {
      kind: "retry";
      failedAttemptNumber: number;
      nextAttemptNumber: number;
      delayMs: number;
      scheduledAtMs: number;
    }
  | {
      kind: "exhausted";
      failedAttemptNumber: number;
      totalAllowedAttempts: number;
    }
  | {
      kind: "not_retryable";
      failedAttemptNumber: number;
      failureKind: Exclude<RetryFailureKind, "transient">;
    };

export type StepRetryInput = Readonly<{
  attemptNumber: number;
  retryLimit: number;
  failureKind: RetryFailureKind;
  nowMs: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  random?: () => number;
}>;

function requireSafeInteger(value: number, label: string, minimum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(label + "_invalid");
  }
}

function retryDelay(
  failedAttemptNumber: number,
  baseDelayMs: number,
  maxDelayMs: number,
  jitterRatio: number,
  randomValue: number,
): number {
  const exponent = Math.min(failedAttemptNumber - 1, 52);
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** exponent);
  const jitterFactor = 1 - jitterRatio + 2 * jitterRatio * randomValue;
  return Math.min(maxDelayMs, Math.max(0, Math.round(exponential * jitterFactor)));
}

/**
 * Returns a deterministic retry decision when callers inject a deterministic
 * random source. Unknown failures must be mapped to "permanent" by the caller;
 * this helper intentionally never guesses that an error is transient.
 */
export function decideStepRetry(input: StepRetryInput): StepRetryDecision {
  requireSafeInteger(input.attemptNumber, "attempt_number", 1);
  requireSafeInteger(input.retryLimit, "retry_limit", 0);
  if (input.retryLimit > 10) throw new RangeError("retry_limit_invalid");
  requireSafeInteger(input.nowMs, "now_ms", 0);
  if (!["transient", "permanent", "cancelled"].includes(input.failureKind)) {
    throw new TypeError("failure_kind_invalid");
  }

  const baseDelayMs = input.baseDelayMs ?? 1_000;
  const maxDelayMs = input.maxDelayMs ?? 60_000;
  const jitterRatio = input.jitterRatio ?? 0.2;
  const random = input.random ?? Math.random;

  requireSafeInteger(baseDelayMs, "base_delay_ms", 1);
  requireSafeInteger(maxDelayMs, "max_delay_ms", baseDelayMs);
  if (!Number.isFinite(jitterRatio) || jitterRatio < 0 || jitterRatio > 1) {
    throw new RangeError("jitter_ratio_invalid");
  }
  if (typeof random !== "function") throw new TypeError("random_source_invalid");

  if (input.failureKind !== "transient") {
    return {
      kind: "not_retryable",
      failedAttemptNumber: input.attemptNumber,
      failureKind: input.failureKind,
    };
  }

  // retryLimit counts retries after the initial attempt, not total attempts.
  if (input.attemptNumber > input.retryLimit) {
    return {
      kind: "exhausted",
      failedAttemptNumber: input.attemptNumber,
      totalAllowedAttempts: 1 + input.retryLimit,
    };
  }

  const randomValue = random();
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue > 1) {
    throw new RangeError("random_value_invalid");
  }

  const delayMs = retryDelay(
    input.attemptNumber,
    baseDelayMs,
    maxDelayMs,
    jitterRatio,
    randomValue,
  );
  const scheduledAtMs = input.nowMs + delayMs;
  if (!Number.isSafeInteger(scheduledAtMs)) {
    throw new RangeError("scheduled_at_ms_overflow");
  }

  return {
    kind: "retry",
    failedAttemptNumber: input.attemptNumber,
    nextAttemptNumber: input.attemptNumber + 1,
    delayMs,
    scheduledAtMs,
  };
}

export type StepSummaryStatus = "queued" | "running" | "succeeded" | "failed" | "skipped";

/**
 * State transitions for the mutable current-state summary row only.
 * Immutable attempt history must be stored separately.
 */
const STEP_TRANSITIONS: Readonly<Record<StepSummaryStatus, readonly StepSummaryStatus[]>> = {
  queued: ["running", "skipped"],
  running: ["succeeded", "failed", "queued"],
  succeeded: [],
  failed: ["queued"],
  skipped: [],
};

function isStepSummaryStatus(value: unknown): value is StepSummaryStatus {
  return typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(STEP_TRANSITIONS, value);
}

export function canTransitionStepStatus(
  current: StepSummaryStatus,
  next: StepSummaryStatus,
): boolean {
  // Persisted values and API payloads are runtime input, even when callers
  // provide compile-time TypeScript types. Unknown states must fail closed.
  if (!isStepSummaryStatus(current) || !isStepSummaryStatus(next)) return false;
  return STEP_TRANSITIONS[current].includes(next);
}

export function assertStepStatusTransition(
  current: StepSummaryStatus,
  next: StepSummaryStatus,
): void {
  if (!canTransitionStepStatus(current, next)) {
    throw new Error("invalid_step_status_transition:" + current + "->" + next);
  }
}
