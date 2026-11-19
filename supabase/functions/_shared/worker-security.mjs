/** Runtime-neutral security and execution-budget helpers for Edge Functions and Node tests. */

export function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function isClaimedRunValid(run) {
  return run !== null && typeof run === "object" && !Array.isArray(run) &&
    isNonEmptyString(run.id) &&
    isNonEmptyString(run.workflow_id) &&
    isNonEmptyString(run.owner_id);
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
