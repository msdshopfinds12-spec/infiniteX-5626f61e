/**
 * Trusted-server bridge between the approval service and a task-store driver.
 *
 * The driver MUST enforce ownership on reads and an atomic compare-and-swap
 * transaction on claims. This module does not make an in-memory driver durable.
 */
export class ApprovalTaskStoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ApprovalTaskStoreError";
    this.code = code;
  }
}

function requiredString(value, field) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 128) {
    throw new ApprovalTaskStoreError("INVALID_" + field.toUpperCase(), field + " must be a non-empty string of at most 128 characters.");
  }
  return value.trim();
}

function verifiedSubject(principal) {
  return requiredString(principal?.subject, "principal_subject");
}

function validateSnapshot(row, taskId, subject) {
  if (!row || row.taskId !== taskId || row.ownerSubject !== subject ||
      row.status !== "awaiting_approval") {
    return null;
  }
  for (const field of ["taskVersion", "agentId", "agentVersion", "capabilityId", "capabilityVersion"]) {
    requiredString(row[field], field);
  }
  if (!row.input || typeof row.input !== "object" || Array.isArray(row.input)) {
    throw new ApprovalTaskStoreError("INVALID_TASK_INPUT", "The trusted task store returned an invalid input object.");
  }
  return Object.freeze({
    taskId: row.taskId,
    taskVersion: row.taskVersion,
    status: row.status,
    agentId: row.agentId,
    agentVersion: row.agentVersion,
    capabilityId: row.capabilityId,
    capabilityVersion: row.capabilityVersion,
    input: row.input,
  });
}

/**
 * Returns callbacks matching createApprovedCapabilityService's storage seam.
 *
 * Required driver contract:
 * - getApprovalSnapshot({ taskId, principalSubject }) returns the canonical
 *   server-owned row, or null. It must enforce tenant/owner isolation.
 * - claimApprovedTask({ taskId, principalSubject, expectedTaskVersion,
 *   expectedPayloadHash, expectedAgentId, expectedAgentVersion,
 *   expectedCapabilityId, expectedCapabilityVersion, fromStatus, toStatus })
 *   performs one durable atomic conditional update and returns true only when
 *   exactly one row was claimed. It must compare every supplied field and
 *   append the running event in the same transaction.
 *
 * A boolean returned by a process-local Map is not sufficient for production.
 */
export function createApprovalTaskStoreAdapter({ store } = {}) {
  if (!store || typeof store.getApprovalSnapshot !== "function" ||
      typeof store.claimApprovedTask !== "function") {
    throw new TypeError("A task store with getApprovalSnapshot and claimApprovedTask is required.");
  }

  async function read({ taskId, principal }) {
    const id = requiredString(taskId, "task_id");
    const subject = verifiedSubject(principal);
    let row;
    try {
      row = await store.getApprovalSnapshot(Object.freeze({
        taskId: id,
        principalSubject: subject,
      }));
    } catch {
      throw new ApprovalTaskStoreError("TASK_STORE_UNAVAILABLE", "The trusted task store could not be read.");
    }
    return validateSnapshot(row, id, subject);
  }

  async function getTaskSnapshot({ taskId, principal } = {}) {
    const snapshot = await read({ taskId, principal });
    if (!snapshot) {
      throw new ApprovalTaskStoreError("TASK_NOT_AVAILABLE", "The task is unavailable to this principal or is not awaiting approval.");
    }
    return snapshot;
  }

  async function isTaskAwaitingApproval(taskId, principal) {
    try {
      return (await read({ taskId, principal })) !== null;
    } catch {
      return false;
    }
  }

  async function claimTaskForExecution(claim = {}) {
    const taskId = requiredString(claim.taskId, "task_id");
    const principalSubject = verifiedSubject(claim.principal);
    const expectedTaskVersion = requiredString(claim.taskVersion, "task_version");
    const expectedPayloadHash = requiredString(claim.payloadHash, "payload_hash");
    if (!/^[a-f0-9]{64}$/u.test(expectedPayloadHash)) return false;
    const expectedAgentId = requiredString(claim.agentId, "agent_id");
    const expectedAgentVersion = requiredString(claim.agentVersion, "agent_version");
    const expectedCapabilityId = requiredString(claim.capabilityId, "capability_id");
    const expectedCapabilityVersion = requiredString(claim.capabilityVersion, "capability_version");

    try {
      return await store.claimApprovedTask(Object.freeze({
        taskId,
        principalSubject,
        expectedTaskVersion,
        expectedPayloadHash,
        expectedAgentId,
        expectedAgentVersion,
        expectedCapabilityId,
        expectedCapabilityVersion,
        fromStatus: "awaiting_approval",
        toStatus: "running",
      })) === true;
    } catch {
      return false;
    }
  }

  return Object.freeze({
    getTaskSnapshot,
    isTaskAwaitingApproval,
    claimTaskForExecution,
  });
}
