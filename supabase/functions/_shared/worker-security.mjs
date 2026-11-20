/** Runtime-neutral security and execution-budget helpers for Edge Functions and Node tests. */

export function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function isValidAttempt(value) {
  return Number.isSafeInteger(value) && value > 0;
}

export function isClaimedRunValid(run) {
  return run !== null && typeof run === "object" && !Array.isArray(run) &&
    isNonEmptyString(run.id) &&
    isNonEmptyString(run.workflow_id) &&
    isNonEmptyString(run.owner_id) &&
    isValidAttempt(run.attempt);
}

export function isClaimedRunOwnedBy(run, ownerId) {
  return isClaimedRunValid(run) && isNonEmptyString(ownerId) && run.owner_id === ownerId;
}

export function isWorkflowOwnedBy(workflow, workflowId, ownerId) {
  return workflow !== null && typeof workflow === "object" && !Array.isArray(workflow) &&
    isNonEmptyString(workflow.id) &&
    isNonEmptyString(workflow.owner_id) &&
    isNonEmptyString(workflowId) &&
    isNonEmptyString(ownerId) &&
    workflow.id === workflowId &&
    workflow.owner_id === ownerId;
}

export function clampBatchLimit(value, fallback = 3, maximum = 5) {
  const safeFallback = Number.isInteger(fallback) && fallback > 0 ? fallback : 3;
  const safeMaximum = Number.isInteger(maximum) && maximum > 0 ? maximum : 5;
  if (!Number.isInteger(value)) return Math.min(safeFallback, safeMaximum);
  return Math.max(1, Math.min(value, safeMaximum));
}

/** Missing timeout values use a bounded default; malformed explicit values fail closed. */
export function validateStepTimeoutSeconds(value, defaultSeconds = 30, maximumSeconds = 300) {
  if (!Number.isInteger(defaultSeconds) || defaultSeconds < 1 ||
      !Number.isInteger(maximumSeconds) || maximumSeconds < defaultSeconds) {
    throw new TypeError("invalid_timeout_policy");
  }
  if (value === undefined || value === null) return defaultSeconds;
  if (!Number.isInteger(value) || value < 1 || value > maximumSeconds) {
    throw new RangeError("step_timeout_seconds_invalid");
  }
  return value;
}

/** Uses a monotonic clock value (performance.now()), not wall-clock time. */
export function createStepDeadline(timeoutSeconds, startedAt = performance.now()) {
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 ||
      !Number.isFinite(startedAt)) {
    throw new TypeError("invalid_step_deadline");
  }
  return startedAt + timeoutSeconds * 1000;
}

export function assertStepDeadline(deadline, now = performance.now()) {
  if (!Number.isFinite(deadline) || !Number.isFinite(now)) {
    throw new TypeError("invalid_step_deadline");
  }
  if (now >= deadline) throw new Error("step_timeout_exceeded");
}

/** Bounds JSON-compatible payloads by their UTF-8 encoded size. */
export function assertJsonByteLimit(value, maxBytes) {
  if (!Number.isInteger(maxBytes) || maxBytes < 1) {
    throw new TypeError("maxBytes_must_be_positive_integer");
  }
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new TypeError("payload_not_json_serializable");
  }
  if (typeof serialized !== "string") {
    throw new TypeError("payload_not_json_serializable");
  }
  const byteLength = new TextEncoder().encode(serialized).byteLength;
  if (byteLength > maxBytes) throw new RangeError("payload_too_large");
  return byteLength;
}

/** Read JSON while enforcing the limit against actual streamed bytes, not Content-Length. */
export async function readJsonBodyLimited(request, maxBytes) {
  if (!Number.isInteger(maxBytes) || maxBytes < 1) {
    throw new TypeError("maxBytes_must_be_positive_integer");
  }
  if (!request.body) return { ok: true, value: null };
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel("payload_too_large"); } catch { /* best-effort cancellation */ }
        return { ok: false, reason: "payload_too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "body_read_failed" };
  } finally {
    try { reader.releaseLock(); } catch { /* reader may already be released */ }
  }
  if (total === 0) return { ok: true, value: null };
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(decoded) };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}


/**
 * Executes a synchronous local action within a cooperative deadline budget.
 * This checks before/after execution; it cannot preempt a synchronous function
 * that blocks the JavaScript isolate. Keep inputs bounded and isolate CPU-heavy
 * or external work behind a separately cancellable worker/job boundary.
 */
export function executeWithinStepBudget(
  action,
  input,
  timeoutSeconds,
  maxBytes = 64 * 1024,
  now = () => performance.now(),
) {
  if (typeof action !== "function") throw new TypeError("action_must_be_function");
  if (typeof now !== "function") throw new TypeError("clock_must_be_function");
  const startedAt = now();
  const deadline = createStepDeadline(timeoutSeconds, startedAt);
  assertStepDeadline(deadline, now());
  assertJsonByteLimit(input, maxBytes);
  const output = action();
  assertStepDeadline(deadline, now());
  assertJsonByteLimit(output, maxBytes);
  return output;
}


const RETRYABLE_STEP_ERROR_CODES = new Set([
  "NETWORK_ERROR",
  "UPSTREAM_TIMEOUT",
  "UPSTREAM_UNAVAILABLE",
  "RATE_LIMITED",
]);

/** retry_limit means additional attempts after the initial execution; hard cap prevents runaway work. */
export function validateRetryLimit(value, defaultRetries = 0, maximumRetries = 5) {
  if (!Number.isInteger(defaultRetries) || defaultRetries < 0 ||
      !Number.isInteger(maximumRetries) || maximumRetries < defaultRetries) {
    throw new TypeError("invalid_retry_policy");
  }
  if (value === undefined || value === null) return defaultRetries;
  if (!Number.isInteger(value) || value < 0 || value > maximumRetries) {
    throw new RangeError("step_retry_limit_invalid");
  }
  return value;
}

/** Only explicitly tagged, allowlisted transient failures are eligible for retry. */
export function isRetryableStepError(error) {
  return error !== null && typeof error === "object" &&
    typeof error.code === "string" &&
    RETRYABLE_STEP_ERROR_CODES.has(error.code);
}

/**
 * Bounded retry with capped exponential full jitter.
 * The default safe action set is deterministic; it will not retry ordinary
 * validation/action errors. External actions must opt in by throwing an
 * allowlisted error code. Sleep and randomness are injectable for tests.
 */
export async function executeWithRetry(action, retryLimit, options = {}) {
  if (typeof action !== "function") throw new TypeError("action_must_be_function");
  const retries = validateRetryLimit(retryLimit);
  const baseDelayMs = options.baseDelayMs ?? 100;
  const maxDelayMs = options.maxDelayMs ?? 1000;
  const maxElapsedMs = options.maxElapsedMs ?? 30_000;
  const sleep = options.sleep ?? ((milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const random = options.random ?? Math.random;
  const now = options.now ?? (() => performance.now());
  if (!Number.isInteger(baseDelayMs) || baseDelayMs < 0 ||
      !Number.isInteger(maxDelayMs) || maxDelayMs < baseDelayMs ||
      !Number.isFinite(maxElapsedMs) || maxElapsedMs < 1 ||
      typeof sleep !== "function" || typeof random !== "function" || typeof now !== "function") {
    throw new TypeError("invalid_retry_options");
  }

  const deadline = now() + maxElapsedMs;
  for (let attempt = 0; ; attempt++) {
    if (now() >= deadline) throw new Error("step_timeout_exceeded");
    try {
      const result = await action(attempt);
      if (now() >= deadline) throw new Error("step_timeout_exceeded");
      return result;
    } catch (error) {
      if (attempt >= retries || !isRetryableStepError(error)) throw error;
      const remainingMs = deadline - now();
      if (remainingMs <= 0) throw new Error("step_timeout_exceeded");
      const ceiling = Math.min(maxDelayMs, baseDelayMs * (2 ** attempt));
      const sample = random();
      const boundedSample = Number.isFinite(sample) ? Math.max(0, Math.min(1, sample)) : 0;
      const delayMs = Math.min(Math.floor(ceiling * boundedSample), Math.floor(remainingMs));
      if (delayMs > 0) await sleep(delayMs);
    }
  }
}
