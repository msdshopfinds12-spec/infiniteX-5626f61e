/**
 * Versioned, provider-neutral adapter for the two-stage approval protocol.
 *
 * This is a contract boundary only. The injected driver must implement each
 * operation as one durable transaction (including state, event, idempotency,
 * grant consumption, and lease writes). This module does not make a driver
 * durable and does not start capability execution.
 */
export class ApprovalProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ApprovalProtocolError";
    this.code = code;
  }
}

const HASH = /^[a-f0-9]{64}$/u;
const OUTCOMES = Object.freeze({
  approval: new Set(["approved", "conflict", "approval_invalid", "not_available"]),
  claim: new Set(["claimed", "conflict", "not_available", "already_claimed"]),
});

function requiredString(value, field, max = 128) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
    throw new ApprovalProtocolError("INVALID_" + field.toUpperCase(), field + " must be a non-empty string of at most " + max + " characters.");
  }
  return value.trim();
}

function digest(value, field) {
  const result = requiredString(value, field, 64);
  if (!HASH.test(result)) throw new ApprovalProtocolError("INVALID_" + field.toUpperCase(), field + " must be a lowercase SHA-256 hex digest.");
  return result;
}

function idempotency(value) {
  return requiredString(value, "idempotency_key", 200);
}

function validateTask(task, expectedStatus) {
  if (!task || typeof task !== "object" || Array.isArray(task) || task.status !== expectedStatus) {
    throw new ApprovalProtocolError("INVALID_STORE_RESULT", "The durable driver returned an invalid task state.");
  }
  return Object.freeze({ ...task });
}

function validateOutcome(result, kind) {
  if (!result || typeof result !== "object" || Array.isArray(result) ||
      !OUTCOMES[kind].has(result.outcome)) {
    throw new ApprovalProtocolError("INVALID_STORE_RESULT", "The durable driver returned an unsupported protocol outcome.");
  }
  if (kind === "approval" && result.outcome === "approved") {
    return Object.freeze({ outcome: "approved", task: validateTask(result.task, "approved") });
  }
  if (kind === "claim" && result.outcome === "claimed") {
    const task = validateTask(result.task, "running");
    const lease = result.lease;
    if (!lease || typeof lease !== "object" || Array.isArray(lease)) {
      throw new ApprovalProtocolError("INVALID_STORE_RESULT", "The durable driver did not return a lease.");
    }
    let leaseId;
    let workerSubject;
    try {
      leaseId = requiredString(lease.leaseId, "lease_id");
      workerSubject = requiredString(lease.workerSubject, "worker_subject");
    } catch {
      throw new ApprovalProtocolError("INVALID_STORE_RESULT", "The durable driver returned an invalid lease tuple.");
    }
    if (!Number.isSafeInteger(lease.fencingToken) || lease.fencingToken < 1 ||
        typeof lease.expiresAt !== "string" ||
        !Number.isFinite(Date.parse(lease.expiresAt)) ||
        new Date(lease.expiresAt).toISOString() !== lease.expiresAt) {
      throw new ApprovalProtocolError("INVALID_STORE_RESULT", "The durable driver returned an invalid lease tuple.");
    }
    return Object.freeze({
      outcome: "claimed",
      task,
      lease: Object.freeze({ leaseId, workerSubject, fencingToken: lease.fencingToken, expiresAt: lease.expiresAt }),
    });
  }
  return Object.freeze({ outcome: result.outcome });
}

/**
 * Driver contract:
 * - approveTaskWithGrantV1 performs owner-scoped CAS, DB-time grant validation,
 *   one-time grant consumption, awaiting_approval -> approved, independent
 *   event sequence, and idempotency persistence in one transaction.
 * - claimApprovedTaskV1 performs owner-scoped CAS, authenticated worker binding,
 *   approved -> running, DB-time lease creation, fencing increment, independent
 *   event sequence, and idempotency persistence in one transaction.
 *
 * The adapter passes only a token digest; raw approval tokens never reach the
 * persistence driver. Worker identity is derived from trusted server auth.
 */
export function createApprovalProtocolAdapter({
  store,
  resolvePrincipalSubject,
  resolveWorkerSubject,
} = {}) {
  if (!store || typeof store.approveTaskWithGrantV1 !== "function" ||
      typeof store.claimApprovedTaskV1 !== "function") {
    throw new TypeError("A durable driver implementing both versioned protocol operations is required.");
  }
  if (typeof resolvePrincipalSubject !== "function" ||
      typeof resolveWorkerSubject !== "function") {
    throw new TypeError("Trusted principal and worker identity resolvers are required.");
  }

  function resolveIdentity(resolver, identity, field) {
    let resolved;
    try { resolved = resolver(identity); } catch {
      throw new ApprovalProtocolError("UNTRUSTED_" + field.toUpperCase(), "A trusted identity could not be resolved.");
    }
    return requiredString(resolved, field);
  }

  async function approveTaskWithGrantV1(input = {}) {
    const request = Object.freeze({
      taskId: requiredString(input.taskId, "task_id"),
      principalSubject: resolveIdentity(resolvePrincipalSubject, input.principal, "principal_subject"),
      expectedTaskVersion: requiredString(input.taskVersion, "task_version"),
      expectedPayloadHash: digest(input.payloadHash, "payload_hash"),
      expectedAgentId: requiredString(input.agentId, "agent_id"),
      expectedAgentVersion: requiredString(input.agentVersion, "agent_version"),
      expectedCapabilityId: requiredString(input.capabilityId, "capability_id"),
      expectedCapabilityVersion: requiredString(input.capabilityVersion, "capability_version"),
      approvalTokenDigest: digest(input.approvalTokenDigest, "approval_token_digest"),
      idempotencyKey: idempotency(input.idempotencyKey),
    });
    let result;
    try {
      result = await store.approveTaskWithGrantV1(request);
    } catch {
      throw new ApprovalProtocolError("APPROVAL_STORE_UNAVAILABLE", "The approval transaction could not be completed.");
    }
    return validateOutcome(result, "approval");
  }

  async function claimApprovedTaskV1(input = {}) {
    const leaseDurationMs = input.leaseDurationMs;
    if (!Number.isSafeInteger(leaseDurationMs) || leaseDurationMs < 1_000 || leaseDurationMs > 15 * 60 * 1_000) {
      throw new ApprovalProtocolError("INVALID_LEASE_DURATION", "leaseDurationMs must be between 1000 and 900000.");
    }
    const request = Object.freeze({
      taskId: requiredString(input.taskId, "task_id"),
      principalSubject: subject(input.principal),
      expectedTaskVersion: requiredString(input.taskVersion, "task_version"),
      expectedPayloadHash: digest(input.payloadHash, "payload_hash"),
      expectedAgentId: requiredString(input.agentId, "agent_id"),
      expectedAgentVersion: requiredString(input.agentVersion, "agent_version"),
      expectedCapabilityId: requiredString(input.capabilityId, "capability_id"),
      expectedCapabilityVersion: requiredString(input.capabilityVersion, "capability_version"),
      workerSubject: resolveIdentity(resolveWorkerSubject, input.worker, "worker_subject"),
      leaseDurationMs,
      idempotencyKey: idempotency(input.idempotencyKey),
    });
    let result;
    try {
      result = await store.claimApprovedTaskV1(request);
    } catch {
      throw new ApprovalProtocolError("CLAIM_STORE_UNAVAILABLE", "The worker claim transaction could not be completed.");
    }
    const validated = validateOutcome(result, "claim");
    if (validated.outcome === "claimed" && validated.lease.workerSubject !== request.workerSubject) {
      throw new ApprovalProtocolError("INVALID_STORE_RESULT", "The durable driver returned a lease for a different worker.");
    }
    return validated;
  }

  return Object.freeze({ approveTaskWithGrantV1, claimApprovedTaskV1 });
}
