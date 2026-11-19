import { createHash, randomBytes } from "node:crypto";

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

function snapshot(task, taskId, expectedStatus) {
  if (!task || task.taskId !== taskId || task.status !== expectedStatus) {
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
  const input = JSON.parse(canonicalJson(task.input));
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

function validateApprovedOutcome(result, expectedTaskId) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new TwoStageApprovalError("INVALID_STORE_RESULT", "The grant store returned an invalid result.");
  }
  if (result.outcome !== "issued") {
    if (["conflict", "not_available", "already_issued"].includes(result.outcome)) {
      return Object.freeze({ outcome: result.outcome });
    }
    throw new TwoStageApprovalError("INVALID_STORE_RESULT", "The grant store returned an unsupported result.");
  }
  if (!result.task || result.task.taskId !== expectedTaskId || result.task.status !== "approved") {
    throw new TwoStageApprovalError("INVALID_STORE_RESULT", "The grant store did not confirm the expected approved task state.");
  }
  if (typeof result.expiresAt !== "string" || !Number.isFinite(Date.parse(result.expiresAt)) ||
      new Date(result.expiresAt).toISOString() !== result.expiresAt) {
    throw new TwoStageApprovalError("INVALID_STORE_RESULT", "The grant store returned an invalid grant expiry.");
  }
  return Object.freeze({ outcome: "issued", task: Object.freeze({ ...result.task }), expiresAt: result.expiresAt });
}

/**
 * Trusted-server composition for the durable two-stage approval protocol.
 *
 * grantStore.issueApprovalGrantV1 MUST atomically persist the grant digest and
 * transition awaiting_approval -> approved in one durable transaction. It
 * must use database time for expiry and idempotency. Only the digest is sent
 * to persistence; the raw token is returned once to the authorized caller.
 *
 * This service intentionally does not invoke a capability executor. Execution
 * stays disabled until durable lease renewal, cancellation, and settlement
 * operations are implemented and contract-tested.
 */
export function createTwoStageApprovalService({
  grantStore,
  protocolAdapter,
  loadTaskSnapshot,
  authorizeApproval,
  resolvePrincipalSubject,
  tokenFactory = () => randomBytes(32).toString("base64url"),
  ttlMs = 5 * 60 * 1000,
} = {}) {
  if (!grantStore || typeof grantStore.issueApprovalGrantV1 !== "function" ||
      !protocolAdapter || typeof protocolAdapter.claimApprovedTaskV1 !== "function" ||
      typeof loadTaskSnapshot !== "function" || typeof authorizeApproval !== "function" ||
      typeof resolvePrincipalSubject !== "function") {
    throw new TypeError("A durable grant store, protocol adapter, trusted task loader, authorization callback, and principal resolver are required.");
  }
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 900_000) {
    throw new TypeError("ttlMs must be between 1000 and 900000.");
  }
  if (typeof tokenFactory !== "function") throw new TypeError("tokenFactory must be a function.");

  async function approveTaskV1({ principal, taskId, idempotencyKey } = {}) {
    const id = requiredString(taskId, "task_id");
    const key = requiredString(idempotencyKey, "idempotency_key", 200);
    let principalSubject;
    try {
      principalSubject = requiredString(resolvePrincipalSubject(principal), "principal_subject");
    } catch {
      throw new TwoStageApprovalError("UNTRUSTED_PRINCIPAL", "A trusted principal could not be resolved.");
    }
    let task;
    try {
      task = await loadTaskSnapshot({ taskId: id, principal });
    } catch {
      throw new TwoStageApprovalError("TASK_STORE_UNAVAILABLE", "The trusted task snapshot could not be loaded.");
    }
    const bound = snapshot(task, id, "awaiting_approval");
    let authorized = false;
    try { authorized = await authorizeApproval({ principal, task: bound }) === true; } catch { authorized = false; }
    if (!authorized) {
      throw new TwoStageApprovalError("APPROVAL_FORBIDDEN", "The principal is not authorized to approve this task.");
    }
    let token;
    try { token = tokenFactory(); } catch {
      throw new TwoStageApprovalError("TOKEN_SOURCE_UNAVAILABLE", "A secure approval token could not be generated.");
    }
    if (typeof token !== "string" || !TOKEN.test(token)) {
      throw new TwoStageApprovalError("INVALID_TOKEN_SOURCE", "The secure token source returned an invalid token.");
    }
    const tokenDigest = digest(token);
    let raw;
    try {
      raw = await grantStore.issueApprovalGrantV1(Object.freeze({
        principalSubject,
        taskId: bound.taskId,
        expectedTaskVersion: bound.taskVersion,
        expectedPayloadHash: bound.payloadHash,
        expectedAgentId: bound.agentId,
        expectedAgentVersion: bound.agentVersion,
        expectedCapabilityId: bound.capabilityId,
        expectedCapabilityVersion: bound.capabilityVersion,
        approvalTokenDigest: tokenDigest,
        ttlMs,
        idempotencyKey: key,
      }));
    } catch {
      throw new TwoStageApprovalError("GRANT_STORE_UNAVAILABLE", "The durable approval grant transaction could not be completed.");
    }
    const result = validateApprovedOutcome(raw, bound.taskId);
    if (result.outcome !== "issued") return result;
    return Object.freeze({
      outcome: "issued",
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
