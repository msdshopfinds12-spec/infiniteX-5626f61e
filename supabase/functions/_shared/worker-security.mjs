/** Pure, runtime-neutral policy helpers shared by Edge Functions and Node tests. */
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

/** Read and parse a JSON request body while enforcing the limit on actual bytes read. */
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
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}
