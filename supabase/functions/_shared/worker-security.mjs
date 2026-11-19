/** Pure, runtime-neutral policy helpers shared by Edge Functions and Node tests. */
export function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
export function isClaimedRunValid(run) {
  return run !== null && typeof run === "object" && !Array.isArray(run) &&
    isNonEmptyString(run.id) && isNonEmptyString(run.workflow_id) && isNonEmptyString(run.owner_id);
}
export function isClaimedRunOwnedBy(run, ownerId) {
  return isClaimedRunValid(run) && isNonEmptyString(ownerId) && run.owner_id === ownerId;
}
export function isWorkflowOwnedBy(workflow, workflowId, ownerId) {
  return workflow !== null && typeof workflow === "object" && !Array.isArray(workflow) &&
    isNonEmptyString(workflow.id) && isNonEmptyString(workflow.owner_id) &&
    isNonEmptyString(workflowId) && isNonEmptyString(ownerId) &&
    workflow.id === workflowId && workflow.owner_id === ownerId;
}
export function clampBatchLimit(value, fallback = 3, maximum = 5) {
  const safeFallback = Number.isInteger(fallback) && fallback > 0 ? fallback : 3;
  const safeMaximum = Number.isInteger(maximum) && maximum > 0 ? maximum : 5;
  if (!Number.isInteger(value)) return Math.min(safeFallback, safeMaximum);
  return Math.max(1, Math.min(value, safeMaximum));
}
/** Fail closed for missing, fractional, negative, zero, or excessive step budgets. */
export function validateStepTimeoutSeconds(value, maximum = 60) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error("invalid_step_timeout_seconds");
  }
  return value;
}
export function createStepDeadline(timeoutSeconds, now = () => performance.now()) {
  const safeTimeout = validateStepTimeoutSeconds(timeoutSeconds);
  const startedAt = now();
  if (!Number.isFinite(startedAt)) throw new TypeError("invalid_monotonic_clock");
  return startedAt + safeTimeout * 1000;
}
export function assertStepDeadline(deadline, now = () => performance.now()) {
  const currentTime = now();
  if (!Number.isFinite(deadline) || !Number.isFinite(currentTime)) {
    throw new TypeError("invalid_step_deadline");
  }
  if (currentTime > deadline) throw new Error("step_timeout_exceeded");
}
/** Enforce UTF-8 serialized JSON size before action execution and persistence. */
export function assertJsonByteLimit(value, maxBytes, label = "value") {
  if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new TypeError("maxBytes_must_be_positive_integer");
  let serialized;
  try { serialized = JSON.stringify(value); } catch {
    throw new Error(label + "_must_be_json_serializable");
  }
  if (typeof serialized !== "string") throw new Error(label + "_must_be_json_serializable");
  const actualBytes = new TextEncoder().encode(serialized).byteLength;
  if (actualBytes > maxBytes) throw new Error(label + "_payload_too_large");
  return actualBytes;
}
/**
 * Cooperative deadline guard for bounded synchronous actions. It cannot preempt a
 * synchronous action that blocks the isolate; long-running work needs a cancellable
 * async worker/job boundary.
 */
export function executeWithinStepBudget(action, input, timeoutSeconds, maxBytes = 65536, now = () => performance.now()) {
  if (typeof action !== "function") throw new TypeError("action_must_be_function");
  const deadline = createStepDeadline(timeoutSeconds, now);
  assertJsonByteLimit(input, maxBytes, "step_input");
  assertStepDeadline(deadline, now);
  const output = action(input);
  assertStepDeadline(deadline, now);
  assertJsonByteLimit(output, maxBytes, "step_output");
  return output;
}
/** Read JSON while enforcing the limit on actual bytes read, not Content-Length. */
export async function readJsonBodyLimited(request, maxBytes) {
  if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new TypeError("maxBytes_must_be_positive_integer");
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
        await reader.cancel("payload_too_large");
        return { ok: false, reason: "payload_too_large" };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (total === 0) return { ok: true, value: null };
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) }; }
  catch { return { ok: false, reason: "invalid_json" }; }
}
