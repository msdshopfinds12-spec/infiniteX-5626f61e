import { createHash, randomBytes } from "node:crypto";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,128}$/u;
const IDENTIFIER_MAX = 128;

export class ApprovalAuthorityError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ApprovalAuthorityError";
    this.code = code;
  }
}

function requiredString(value, field) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > IDENTIFIER_MAX) {
    throw new ApprovalAuthorityError("INVALID_" + field.toUpperCase(), field + " must be a non-empty string of at most 128 characters.");
  }
  return value.trim();
}

function digest(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * In-memory, single-use approval grants for a trusted server process.
 *
 * IMPORTANT:
 * - principal must come from verified server authentication middleware.
 * - never pass a principal supplied directly by a browser request.
 * - this store is process-local and non-durable; restart invalidates all grants.
 * - this module does not authenticate users or provide an HTTP/API boundary.
 */
export function createApprovalAuthority({
  ttlMs = 5 * 60 * 1000,
  maxRecords = 2_000,
  now = () => Date.now(),
  tokenFactory = () => randomBytes(32).toString("base64url"),
} = {}) {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 15 * 60 * 1000) {
    throw new TypeError("ttlMs must be between 1000 and 900000.");
  }
  if (!Number.isSafeInteger(maxRecords) || maxRecords < 1 || maxRecords > 20_000) {
    throw new TypeError("maxRecords must be between 1 and 20000.");
  }
  if (typeof now !== "function" || typeof tokenFactory !== "function") {
    throw new TypeError("now and tokenFactory must be functions.");
  }

  const records = new Map();

  function currentTime() {
    const value = now();
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new ApprovalAuthorityError("INVALID_CLOCK", "The approval clock must return a non-negative safe integer.");
    }
    return value;
  }

  function pruneExpired(at) {
    for (const [key, record] of records) {
      if (record.expiresAt <= at) records.delete(key);
    }
  }

  function issue({
    principal,
    taskId,
    action,
    capabilityId,
    capabilityVersion,
    taskVersion,
    agentId,
    agentVersion,
    payloadHash,
  } = {}) {
    const subject = requiredString(principal?.subject, "principal_subject");
    const task = requiredString(taskId, "task_id");
    const actionName = requiredString(action, "action");
    const capability = requiredString(capabilityId, "capability_id");
    const version = requiredString(capabilityVersion, "capability_version");
    const taskVer = requiredString(taskVersion, "task_version");
    const agent = requiredString(agentId, "agent_id");
    const agentVer = requiredString(agentVersion, "agent_version");
    const payloadDigest = requiredString(payloadHash, "payload_hash");
    if (!/^[a-f0-9]{64}$/u.test(payloadDigest)) {
      throw new ApprovalAuthorityError("INVALID_PAYLOAD_HASH", "payloadHash must be a SHA-256 hex digest.");
    }
    const issuedAt = currentTime();
    pruneExpired(issuedAt);
    if (records.size >= maxRecords) {
      throw new ApprovalAuthorityError("APPROVAL_CAPACITY_REACHED", "Approval capacity is full; retry after pending grants expire.");
    }

    const token = tokenFactory();
    if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) {
      throw new ApprovalAuthorityError("INVALID_TOKEN_SOURCE", "The approval token source did not return a sufficiently long URL-safe token.");
    }
    const key = digest(token);
    if (records.has(key)) {
      throw new ApprovalAuthorityError("TOKEN_COLLISION", "The approval token source returned a duplicate token.");
    }
    const expiresAt = issuedAt + ttlMs;
    records.set(key, Object.freeze({
      subject,
      taskId: task,
      action: actionName,
      capabilityId: capability,
      capabilityVersion: version,
      taskVersion: taskVer,
      agentId: agent,
      agentVersion: agentVer,
      payloadHash: payloadDigest,
      issuedAt,
      expiresAt,
    }));
    return Object.freeze({ token, expiresAt });
  }

  function consume({
    token,
    principal,
    taskId,
    action,
    capabilityId,
    capabilityVersion,
    taskVersion,
    agentId,
    agentVersion,
    payloadHash,
  } = {}) {
    if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) return false;
    const subject = principal?.subject;
    if (typeof subject !== "string" || subject.trim().length === 0 || subject.length > IDENTIFIER_MAX) return false;
    const at = currentTime();
    const key = digest(token);
    const grant = records.get(key);
    if (!grant) return false;
    if (grant.expiresAt <= at) {
      records.delete(key);
      return false;
    }

    const matches =
      grant.subject === subject.trim() &&
      grant.taskId === taskId &&
      grant.action === action &&
      grant.capabilityId === capabilityId &&
      grant.capabilityVersion === capabilityVersion &&
      grant.taskVersion === taskVersion &&
      grant.agentId === agentId &&
      grant.agentVersion === agentVersion &&
      grant.payloadHash === payloadHash;
    if (!matches) return false;

    records.delete(key);
    return true;
  }

  function getStats() {
    const at = currentTime();
    pruneExpired(at);
    return Object.freeze({ pending: records.size, maxRecords });
  }

  return Object.freeze({ issue, consume, getStats });
}
