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
  grant: new Set(["issued", "conflict", "not_available", "already_issued"]),
  claim: new Set(["claimed", "conflict", "not_available", "already_claimed"]),
  renew: new Set(["renewed", "conflict", "lease_expired", "stale_fence", "not_available"]),
  settle: new Set(["settled", "conflict", "lease_expired", "stale_fence", "not_available"]),
  cancel: new Set(["cancelled", "conflict", "not_available"]),
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

function validateTask(task, expectedStatus, expectedTaskId) {
  if (!task || typeof task !== "object" || Array.isArray(task) || task.status !== expectedStatus ||
      (task.taskId ?? task.id) !== expectedTaskId) {
    throw new ApprovalProtocolError("INVALID_STORE_RESULT", "The durable driver returned an invalid task state.");
  }
  return Object.freeze({ ...task });
}


function expectedVersion(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ApprovalProtocolError("INVALID_EXPECTED_TASK_VERSION", "expectedTaskVersion must be a positive safe integer.");
  }
  return value;
}

function validateVersionedTask(task, expectedStatus, expectedTaskId, expectedVersion) {
  const validated = validateTask(task, expectedStatus, expectedTaskId);
  if (!Number.isSafeInteger(validated.version) || validated.version !== expectedVersion + 1) {
    throw new ApprovalProtocolError("INVALID_STORE_RESULT", "The durable driver returned an unexpected task version.");
  }
  return validated;
}

function validateLease(lease, expected) {
  if (!lease || typeof lease !== "object" || Array.isArray(lease) ||
      typeof lease.leaseId !== "string" || lease.leaseId.trim() !== expected.leaseId ||
      typeof lease.workerSubject !== "string" || lease.workerSubject !== expected.workerSubject ||
      lease.fencingToken !== expected.fencingToken ||
      typeof lease.expiresAt !== "string" || !Number.isFinite(Date.parse(lease.expiresAt)) ||
      new Date(lease.expiresAt).toISOString() !== lease.expiresAt) {
    throw new ApprovalProtocolError("INVALID_STORE_RESULT", "The durable driver returned a lease that does not match the authenticated lease tuple.");
  }
  return Object.freeze({
    leaseId: lease.leaseId,
    workerSubject: lease.workerSubject,
    fencingToken: lease.fencingToken,
    expiresAt: lease.expiresAt,
  });
}

function validateOutcome(result, kind, expectedTaskId) {
  if (!result || typeof result !== "object" || Array.isArray(result) ||
      !OUTCOMES[kind].has(result.outcome)) {
    throw new ApprovalProtocolError("INVALID_STORE_RESULT", "The durable driver returned an unsupported protocol outcome.");
  }
  if (kind === "approval" && result.outcome === "approved") {
    return Object.freeze({ outcome: "approved", task: validateTask(result.task, "approved", expectedTaskId) });
  }
  if (kind === "grant" && (result.outcome === "issued" || result.outcome === "already_issued")) {
    const task = validateTask(result.task, "approved", expectedTaskId);
    if (typeof result.expiresAt !== "string" || !Number.isFinite(Date.parse(result.expiresAt)) ||
        new Date(result.expiresAt).toISOString() !== result.expiresAt) {
      throw new ApprovalProtocolError("INVALID_STORE_RESULT", "The durable driver returned an invalid grant expiry.");
    }
    return Object.freeze({ outcome: result.outcome, task, expiresAt: result.expiresAt });
  }
  if (kind === "claim" && result.outcome === "claimed") {
    const task = validateTask(result.task, "running", expectedTaskId);
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
 * Durable driver contract:
 * - issueApprovalGrantV1 performs owner-scoped CAS, awaiting_approval -> approved,
 *   grant-digest insertion, DB-time expiry, event append, and idempotency write
 *   in one transaction.
 * - claimApprovedTaskV1 validates and consumes that same one-time digest while
 *   performing owner-scoped CAS, approved -> running, lease creation, fencing
 *   increment, event append, and idempotency write in one transaction.
 * - approveTaskWithGrantV1 remains as a legacy compatibility operation only.
 *
 * The adapter passes only token digests; raw approval tokens never reach the
 * persistence driver. Principal and worker identities come from trusted server
 * authentication resolvers, not client-supplied subject strings.
 */
export function createApprovalProtocolAdapter({
  store,
  resolvePrincipalSubject,
  resolveWorkerSubject,
} = {}) {
  if (!store || (typeof store.approveTaskWithGrantV1 !== "function" &&
      typeof store.issueApprovalGrantV1 !== "function") ||
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

  async function issueApprovalGrantV1(input = {}) {
    if (typeof store.issueApprovalGrantV1 !== "function") {
      throw new ApprovalProtocolError("GRANT_ISSUANCE_UNAVAILABLE", "The durable driver does not implement grant issuance.");
    }
    const ttlMs = input.ttlMs;
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 900_000) {
      throw new ApprovalProtocolError("INVALID_GRANT_TTL", "ttlMs must be between 1000 and 900000.");
    }
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
      ttlMs,
      idempotencyKey: idempotency(input.idempotencyKey),
    });
    let result;
    try {
      result = await store.issueApprovalGrantV1(request);
    } catch {
      throw new ApprovalProtocolError("GRANT_STORE_UNAVAILABLE", "The durable grant transaction could not be completed.");
    }
    return validateOutcome(result, "grant", request.taskId);
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
    return validateOutcome(result, "approval", request.taskId);
  }

  async function claimApprovedTaskV1(input = {}) {
    const leaseDurationMs = input.leaseDurationMs;
    if (!Number.isSafeInteger(leaseDurationMs) || leaseDurationMs < 1_000 || leaseDurationMs > 15 * 60 * 1_000) {
      throw new ApprovalProtocolError("INVALID_LEASE_DURATION", "leaseDurationMs must be between 1000 and 900000.");
    }
    const request = Object.freeze({
      taskId: requiredString(input.taskId, "task_id"),
      principalSubject: resolveIdentity(resolvePrincipalSubject, input.principal, "principal_subject"),
      expectedTaskVersion: requiredString(input.taskVersion, "task_version"),
      expectedPayloadHash: digest(input.payloadHash, "payload_hash"),
      expectedAgentId: requiredString(input.agentId, "agent_id"),
      expectedAgentVersion: requiredString(input.agentVersion, "agent_version"),
      expectedCapabilityId: requiredString(input.capabilityId, "capability_id"),
      expectedCapabilityVersion: requiredString(input.capabilityVersion, "capability_version"),
      workerSubject: resolveIdentity(resolveWorkerSubject, input.worker, "worker_subject"),
      approvalTokenDigest: digest(input.approvalTokenDigest, "approval_token_digest"),
      leaseDurationMs,
      idempotencyKey: idempotency(input.idempotencyKey),
    });
    let result;
    try {
      result = await store.claimApprovedTaskV1(request);
    } catch {
      throw new ApprovalProtocolError("CLAIM_STORE_UNAVAILABLE", "The worker claim transaction could not be completed.");
    }
    const validated = validateOutcome(result, "claim", request.taskId);
    if (validated.outcome === "claimed" && validated.lease.workerSubject !== request.workerSubject) {
      throw new ApprovalProtocolError("INVALID_STORE_RESULT", "The durable driver returned a lease for a different worker.");
    }
    return validated;
  }


  async function renewExecutionLeaseV1(input = {}) {
    if (typeof store.renewExecutionLeaseV1 !== "function") throw new ApprovalProtocolError("LEASE_RENEWAL_UNAVAILABLE", "The durable driver does not implement lease renewal.");
    const leaseDurationMs = input.leaseDurationMs;
    if (!Number.isSafeInteger(leaseDurationMs) || leaseDurationMs < 1_000 || leaseDurationMs > 900_000) throw new ApprovalProtocolError("INVALID_LEASE_DURATION", "leaseDurationMs must be between 1000 and 900000.");
    const request = Object.freeze({
      taskId: requiredString(input.taskId, "task_id"),
      principalSubject: resolveIdentity(resolvePrincipalSubject, input.principal, "principal_subject"),
      workerSubject: resolveIdentity(resolveWorkerSubject, input.worker, "worker_subject"),
      leaseId: requiredString(input.leaseId, "lease_id"),
      fencingToken: expectedVersion(input.fencingToken),
      expectedTaskVersion: expectedVersion(input.expectedTaskVersion),
      leaseDurationMs,
      idempotencyKey: idempotency(input.idempotencyKey),
    });
    let result;
    try { result = await store.renewExecutionLeaseV1(request); } catch {
      throw new ApprovalProtocolError("LEASE_RENEWAL_STORE_UNAVAILABLE", "The lease renewal transaction could not be completed.");
    }
    if (!result || typeof result !== "object" || !OUTCOMES.renew.has(result.outcome)) throw new ApprovalProtocolError("INVALID_STORE_RESULT", "The durable driver returned an unsupported lease-renewal outcome.");
    if (result.outcome !== "renewed") return Object.freeze({ outcome: result.outcome });
    return Object.freeze({ outcome: "renewed", task: validateVersionedTask(result.task, "running", request.taskId, request.expectedTaskVersion), lease: validateLease(result.lease, request) });
  }

  async function settleExecutionV1(input = {}) {
    if (typeof store.settleExecutionV1 !== "function") throw new ApprovalProtocolError("LEASE_SETTLEMENT_UNAVAILABLE", "The durable driver does not implement lease settlement.");
    const targetStatus = input.targetStatus;
    if (targetStatus !== "succeeded" && targetStatus !== "failed") throw new ApprovalProtocolError("INVALID_SETTLEMENT_STATUS", "targetStatus must be succeeded or failed.");
    const request = Object.freeze({
      taskId: requiredString(input.taskId, "task_id"),
      principalSubject: resolveIdentity(resolvePrincipalSubject, input.principal, "principal_subject"),
      workerSubject: resolveIdentity(resolveWorkerSubject, input.worker, "worker_subject"),
      leaseId: requiredString(input.leaseId, "lease_id"),
      fencingToken: expectedVersion(input.fencingToken),
      expectedTaskVersion: expectedVersion(input.expectedTaskVersion),
      targetStatus,
      resultDigest: input.resultDigest == null ? null : digest(input.resultDigest, "result_digest"),
      failureCode: input.failureCode == null ? null : requiredString(input.failureCode, "failure_code", 64),
      idempotencyKey: idempotency(input.idempotencyKey),
    });
    let result;
    try { result = await store.settleExecutionV1(request); } catch {
      throw new ApprovalProtocolError("LEASE_SETTLEMENT_STORE_UNAVAILABLE", "The execution settlement transaction could not be completed.");
    }
    if (!result || typeof result !== "object" || !OUTCOMES.settle.has(result.outcome)) throw new ApprovalProtocolError("INVALID_STORE_RESULT", "The durable driver returned an unsupported settlement outcome.");
    if (result.outcome !== "settled") return Object.freeze({ outcome: result.outcome });
    return Object.freeze({ outcome: "settled", task: validateVersionedTask(result.task, targetStatus, request.taskId, request.expectedTaskVersion) });
  }

  async function cancelApprovedOrRunningTaskV1(input = {}) {
    if (typeof store.cancelApprovedOrRunningTaskV1 !== "function") throw new ApprovalProtocolError("TASK_CANCELLATION_UNAVAILABLE", "The durable driver does not implement task cancellation.");
    const request = Object.freeze({
      taskId: requiredString(input.taskId, "task_id"),
      principalSubject: resolveIdentity(resolvePrincipalSubject, input.principal, "principal_subject"),
      expectedTaskVersion: expectedVersion(input.expectedTaskVersion),
      idempotencyKey: idempotency(input.idempotencyKey),
    });
    let result;
    try { result = await store.cancelApprovedOrRunningTaskV1(request); } catch {
      throw new ApprovalProtocolError("TASK_CANCELLATION_STORE_UNAVAILABLE", "The task cancellation transaction could not be completed.");
    }
    if (!result || typeof result !== "object" || !OUTCOMES.cancel.has(result.outcome)) throw new ApprovalProtocolError("INVALID_STORE_RESULT", "The durable driver returned an unsupported cancellation outcome.");
    if (result.outcome !== "cancelled") return Object.freeze({ outcome: result.outcome });
    return Object.freeze({ outcome: "cancelled", task: validateVersionedTask(result.task, "cancelled", request.taskId, request.expectedTaskVersion) });
  }

  return Object.freeze({ issueApprovalGrantV1, approveTaskWithGrantV1, claimApprovedTaskV1, renewExecutionLeaseV1, settleExecutionV1, cancelApprovedOrRunningTaskV1 });
}
