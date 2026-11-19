import { createHash, createHmac } from "node:crypto";

export class TwoStageApprovalError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TwoStageApprovalError";
    this.code = code;
  }
}

const TOKEN = /^[A-Za-z0-9_-]{40,128}$/u;
const HASH = /^[a-f0-9]{64}$/u;

function requiredString(value, field, max = 128) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
    throw new TwoStageApprovalError("INVALID_" + field.toUpperCase(), field + " must be a non-empty string of at most " + max + " characters.");
  }
  return value.trim();
}

function canonicalJson(value, seen = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (typeof value !== "object" || value === undefined) {
    throw new TwoStageApprovalError("INVALID_TASK_PAYLOAD", "The trusted task input must contain finite JSON values only.");
  }
  if (seen.has(value)) throw new TwoStageApprovalError("INVALID_TASK_PAYLOAD", "The trusted task input must not contain cycles.");
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new TwoStageApprovalError("INVALID_TASK_PAYLOAD", "The trusted task input must contain plain JSON objects only.");
  }
  seen.add(value);
  const result = Array.isArray(value)
    ? "[" + value.map((item) => canonicalJson(item, seen)).join(",") + "]"
    : "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonicalJson(value[key], seen)).join(",") + "}";
  seen.delete(value);
  return result;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function snapshot(task, taskId, expectedStatus) {
  const acceptedStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  if (!task || task.taskId !== taskId || !acceptedStatuses.includes(task.status)) {
    throw new TwoStageApprovalError("TASK_SNAPSHOT_INVALID", "The trusted task snapshot is missing, stale, or in an unexpected state.");
  }
  for (const field of ["taskVersion", "agentId", "agentVersion", "capabilityId", "capabilityVersion"]) {
    requiredString(task[field], field);
  }
  const canonical = canonicalJson({
    input: task.input,
    taskId: task.taskId,
    taskVersion: task.taskVersion,
    agentId: task.agentId,
    agentVersion: task.agentVersion,
    capabilityId: task.capabilityId,
    capabilityVersion: task.capabilityVersion,
  });
  const input = deepFreeze(JSON.parse(canonicalJson(task.input)));
  return Object.freeze({
    taskId: task.taskId,
    taskVersion: task.taskVersion,
    agentId: task.agentId,
    agentVersion: task.agentVersion,
    capabilityId: task.capabilityId,
    capabilityVersion: task.capabilityVersion,
    input,
    payloadHash: createHash("sha256").update(canonical, "utf8").digest("hex"),
  });
}

function digest(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
/**
 * Creates a deterministic, high-entropy approval token scoped to a trusted
 * principal, task, payload, and idempotency key. Only its SHA-256 digest is
 * persisted by the approval store. The secret must be server-only and at
 * least 32 bytes; rotate it only with an explicit token-version migration.
 */
export function createHmacApprovalTokenFactory({ secret, resolvePrincipalSubject } = {}) {
  const key = typeof secret === "string"
    ? Buffer.from(secret, "utf8")
    : secret instanceof Uint8Array
      ? Buffer.from(secret)
      : null;
  if (!key || key.byteLength < 32) {
    throw new TypeError("Approval token secret must contain at least 32 bytes.");
  }
  if (typeof resolvePrincipalSubject !== "function") {
    throw new TypeError("A trusted principal subject resolver is required.");
  }
  return ({ principal, taskId, idempotencyKey, payloadHash } = {}) => {
    let subject;
    try { subject = resolvePrincipalSubject(principal); } catch {
      throw new TwoStageApprovalError("UNTRUSTED_PRINCIPAL", "A trusted principal could not be resolved for token derivation.");
    }
    if (typeof payloadHash !== "string" || !HASH.test(payloadHash)) {
      throw new TwoStageApprovalError("INVALID_PAYLOAD_HASH", "The payload hash must be a lowercase SHA-256 digest.");
    }
    const scope = [
      "InfiniteX/approval-token/v1",
      requiredString(subject, "principal_subject"),
      requiredString(taskId, "task_id"),
      requiredString(idempotencyKey, "idempotency_key", 200),
      payloadHash,
    ].join("\0");
    return createHmac("sha256", key).update(scope, "utf8").digest("base64url");
  };
}

 * Trusted-server composition for the durable two-stage approval protocol.
 *
 * protocolAdapter.issueApprovalGrantV1 delegates to the same durable driver
 * used for worker claims. The driver atomically persists the grant digest and
 * transitions awaiting_approval -> approved, using database time for expiry.
 *
 * This service intentionally does not invoke a capability executor. Execution
 * stays disabled until durable lease renewal, cancellation, and settlement
 * operations are implemented and contract-tested.
 */
export function createTwoStageApprovalService({
  protocolAdapter,
  loadTaskSnapshot,
  authorizeApproval,
  tokenFactory,
  ttlMs = 5 * 60 * 1000,
} = {}) {
  if (!protocolAdapter || typeof protocolAdapter.issueApprovalGrantV1 !== "function" ||
      typeof protocolAdapter.claimApprovedTaskV1 !== "function" ||
      typeof loadTaskSnapshot !== "function" || typeof authorizeApproval !== "function") {
    throw new TypeError("A versioned durable protocol adapter, trusted task loader, and authorization callback are required.");
  }
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 900_000) {
    throw new TypeError("ttlMs must be between 1000 and 900000.");
  }
  if (typeof tokenFactory !== "function") throw new TypeError("A deterministic, server-secret-backed tokenFactory is required for safe idempotent approval retries.");

  async function approveTaskV1({ principal, taskId, idempotencyKey } = {}) {
    const id = requiredString(taskId, "task_id");
    const key = requiredString(idempotencyKey, "idempotency_key", 200);
    let task;
    try {
      task = await loadTaskSnapshot({ taskId: id, principal });
    } catch {
      throw new TwoStageApprovalError("TASK_STORE_UNAVAILABLE", "The trusted task snapshot could not be loaded.");
    }
    const bound = snapshot(task, id, ["awaiting_approval", "approved"]);
    let authorized = false;
    try { authorized = await authorizeApproval({ principal, task: bound }) === true; } catch { authorized = false; }
    if (!authorized) {
      throw new TwoStageApprovalError("APPROVAL_FORBIDDEN", "The principal is not authorized to approve this task.");
    }
    let token;
    try { token = tokenFactory({ principal, taskId: id, idempotencyKey: key, payloadHash: bound.payloadHash }); } catch {
      throw new TwoStageApprovalError("TOKEN_SOURCE_UNAVAILABLE", "A secure approval token could not be generated.");
    }
    if (typeof token !== "string" || !TOKEN.test(token)) {
      throw new TwoStageApprovalError("INVALID_TOKEN_SOURCE", "The secure token source returned an invalid token.");
    }
    const tokenDigest = digest(token);
    let result;
    try {
      result = await protocolAdapter.issueApprovalGrantV1({
        principal,
        taskId: bound.taskId,
        taskVersion: bound.taskVersion,
        payloadHash: bound.payloadHash,
        agentId: bound.agentId,
        agentVersion: bound.agentVersion,
        capabilityId: bound.capabilityId,
        capabilityVersion: bound.capabilityVersion,
        approvalTokenDigest: tokenDigest,
        ttlMs,
        idempotencyKey: key,
      });
    } catch (error) {
      if (error?.code === "UNTRUSTED_PRINCIPAL_SUBJECT") {
        throw new TwoStageApprovalError("UNTRUSTED_PRINCIPAL", "A trusted principal could not be resolved.");
      }
      throw new TwoStageApprovalError("GRANT_STORE_UNAVAILABLE", "The durable approval grant transaction could not be completed.");
    }
    if (result.outcome !== "issued" && result.outcome !== "already_issued") return result;
    return Object.freeze({
      outcome: result.outcome,
      task: result.task,
      approvalToken: token,
      expiresAt: result.expiresAt,
    });
  }

  async function claimApprovedTaskV1({
    principal, worker, taskId, approvalToken, idempotencyKey, leaseDurationMs,
  } = {}) {
    const id = requiredString(taskId, "task_id");
    const key = requiredString(idempotencyKey, "idempotency_key", 200);
    if (typeof approvalToken !== "string" || !TOKEN.test(approvalToken)) {
      throw new TwoStageApprovalError("INVALID_APPROVAL_TOKEN", "A valid one-time approval token is required.");
    }
    let task;
    try {
      task = await loadTaskSnapshot({ taskId: id, principal });
    } catch {
      throw new TwoStageApprovalError("TASK_STORE_UNAVAILABLE", "The trusted task snapshot could not be loaded.");
    }
    const bound = snapshot(task, id, "approved");
    try {
      return await protocolAdapter.claimApprovedTaskV1({
        ...bound,
        principal,
        worker,
        approvalTokenDigest: digest(approvalToken),
        idempotencyKey: key,
        leaseDurationMs,
      });
    } catch (error) {
      if (error instanceof TwoStageApprovalError) throw error;
      throw new TwoStageApprovalError("WORKER_CLAIM_FAILED", "The trusted worker claim could not be completed.");
    }
  }

  return Object.freeze({ approveTaskV1, claimApprovedTaskV1 });
}
