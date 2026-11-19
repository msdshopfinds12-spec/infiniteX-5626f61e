import { createHash } from "node:crypto";
import { ApprovalAuthorityError } from "./approval-authority.mjs";

export class ApprovedExecutionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ApprovedExecutionError";
    this.code = code;
  }
}

function canonicalJson(value, seen = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (typeof value !== "object" || value === undefined) {
    throw new ApprovedExecutionError("INVALID_TASK_PAYLOAD", "The server-owned task payload must be finite JSON data.");
  }
  if (seen.has(value)) throw new ApprovedExecutionError("INVALID_TASK_PAYLOAD", "The task payload must not contain cycles.");
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new ApprovedExecutionError("INVALID_TASK_PAYLOAD", "The task payload must contain only plain JSON objects.");
  }
  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    result = "[" + value.map((item) => canonicalJson(item, seen)).join(",") + "]";
  } else {
    const keys = Object.keys(value).sort();
    result = "{" + keys.map((key) => JSON.stringify(key) + ":" + canonicalJson(value[key], seen)).join(",") + "}";
  }
  seen.delete(value);
  return result;
}

function snapshotPayload(task) {
  const boundPayload = {
    input: task.input,
    taskId: task.taskId,
    taskVersion: task.taskVersion,
    agentId: task.agentId,
    agentVersion: task.agentVersion,
    capabilityId: task.capabilityId,
    capabilityVersion: task.capabilityVersion,
  };
  const canonical = canonicalJson(boundPayload);
  return Object.freeze({
    payloadHash: createHash("sha256").update(canonical, "utf8").digest("hex"),
    input: JSON.parse(canonicalJson(task.input)),
  });
}

function validateTaskSnapshot(task, taskId, capabilityId, capabilityVersion) {
  if (!task || task.taskId !== taskId || task.status !== "awaiting_approval" ||
      task.capabilityId !== capabilityId || task.capabilityVersion !== capabilityVersion) {
    throw new ApprovedExecutionError("TASK_SNAPSHOT_INVALID", "The trusted task snapshot is missing, stale, or inconsistent.");
  }
  for (const field of ["taskVersion", "agentId", "agentVersion", "capabilityId", "capabilityVersion"]) {
    if (typeof task[field] !== "string" || task[field].trim() === "") {
      throw new ApprovedExecutionError("TASK_SNAPSHOT_INVALID", "The trusted task snapshot is incomplete.");
    }
  }
  const payload = snapshotPayload(task);
  return Object.freeze({
    taskId: task.taskId,
    taskVersion: task.taskVersion,
    agentId: task.agentId,
    agentVersion: task.agentVersion,
    capabilityId: task.capabilityId,
    capabilityVersion: task.capabilityVersion,
    input: payload.input,
    payloadHash: payload.payloadHash,
  });
}

/**
 * Trusted-server-only approval composition.
 * getTaskSnapshot must load the canonical task from server-owned storage.
 * Browser-supplied input, agent IDs, versions, and task state are never executed.
 * claimTaskForExecution must atomically compare the supplied version/hash and
 * transition the task to running in the same durable transaction.
 */
export function createApprovedCapabilityService({
  approvalAuthority,
  capabilityExecutor,
  authorize,
  isTaskAwaitingApproval,
  getTaskSnapshot,
  claimTaskForExecution,
  claimTaskWithApproval,
  maxConcurrentExecutions = 4,
} = {}) {
  if (!approvalAuthority || typeof approvalAuthority.issue !== "function" ||
      (typeof approvalAuthority.consume !== "function" && typeof claimTaskWithApproval !== "function")) {
    throw new TypeError("An approval issuer and either a consumer or atomic claim callback are required.");
  }
  if (claimTaskWithApproval !== undefined && typeof claimTaskWithApproval !== "function") {
    throw new TypeError("claimTaskWithApproval must be a function when provided.");
  }
  if (!capabilityExecutor || typeof capabilityExecutor.run !== "function") {
    throw new TypeError("A valid capability executor is required.");
  }
  if (typeof authorize !== "function" || typeof isTaskAwaitingApproval !== "function" ||
      typeof getTaskSnapshot !== "function" ||
      (typeof claimTaskWithApproval !== "function" && typeof claimTaskForExecution !== "function")) {
    throw new TypeError("Server authorization, task snapshot, state, and a supported claim callback are required.");
  }
  if (!Number.isSafeInteger(maxConcurrentExecutions) || maxConcurrentExecutions < 1 || maxConcurrentExecutions > 100) {
    throw new TypeError("maxConcurrentExecutions must be an integer between 1 and 100.");
  }

  let activeExecutions = 0;

  async function isAllowed(principal, operation, taskId, capabilityId) {
    try {
      return await authorize(principal, Object.freeze({ operation, taskId, capabilityId })) === true;
    } catch {
      return false;
    }
  }

  async function loadSnapshot(taskId, principal, capabilityId, capabilityVersion) {
    let task;
    try {
      task = await getTaskSnapshot(Object.freeze({ taskId, principal }));
    } catch {
      throw new ApprovedExecutionError("TASK_SNAPSHOT_UNAVAILABLE", "The trusted task snapshot could not be loaded.");
    }
    return validateTaskSnapshot(task, taskId, capabilityId, capabilityVersion);
  }

  async function requestApproval({ principal, taskId, capabilityId, capabilityVersion } = {}) {
    if (!await isAllowed(principal, "approve", taskId, capabilityId)) {
      throw new ApprovedExecutionError("APPROVAL_FORBIDDEN", "The principal is not authorized to approve this task.");
    }
    let awaiting = false;
    try { awaiting = await isTaskAwaitingApproval(taskId, principal) === true; } catch { awaiting = false; }
    if (!awaiting) throw new ApprovedExecutionError("TASK_NOT_AWAITING_APPROVAL", "The task is not awaiting approval.");

    const snapshot = await loadSnapshot(taskId, principal, capabilityId, capabilityVersion);
    try {
      return await approvalAuthority.issue({
        principal, taskId, action: "execute",
        capabilityId: snapshot.capabilityId,
        capabilityVersion: snapshot.capabilityVersion,
        taskVersion: snapshot.taskVersion,
        agentId: snapshot.agentId,
        agentVersion: snapshot.agentVersion,
        payloadHash: snapshot.payloadHash,
      });
    } catch (error) {
      if (error instanceof ApprovalAuthorityError) {
        throw new ApprovedExecutionError(error.code, "An approval grant could not be issued.");
      }
      throw new ApprovedExecutionError("APPROVAL_ISSUE_FAILED", "An approval grant could not be issued.");
    }
  }

  async function executeApproved({ principal, taskId, capabilityId, capabilityVersion, approvalToken, signal } = {}) {
    if (!await isAllowed(principal, "execute", taskId, capabilityId)) {
      throw new ApprovedExecutionError("EXECUTION_FORBIDDEN", "The principal is not authorized to execute this task.");
    }
    let awaiting = false;
    try { awaiting = await isTaskAwaitingApproval(taskId, principal) === true; } catch { awaiting = false; }
    if (!awaiting) throw new ApprovedExecutionError("TASK_NOT_AWAITING_APPROVAL", "The task is not awaiting approval.");
    if (signal !== undefined && (!signal || typeof signal.aborted !== "boolean")) {
      throw new ApprovedExecutionError("INVALID_SIGNAL", "signal must be an AbortSignal.");
    }
    if (signal?.aborted) throw new ApprovedExecutionError("ABORTED", "The approved execution was cancelled before it started.");
    if (activeExecutions >= maxConcurrentExecutions) {
      throw new ApprovedExecutionError("EXECUTION_CAPACITY_EXCEEDED", "The local execution capacity is full; retry after an active task finishes.");
    }

    activeExecutions += 1;
    try {
      const snapshot = await loadSnapshot(taskId, principal, capabilityId, capabilityVersion);
      let claimed = false;
      if (claimTaskWithApproval) {
        if (typeof approvalToken !== "string" || !/^[A-Za-z0-9_-]{40,128}$/u.test(approvalToken)) {
          throw new ApprovedExecutionError("APPROVAL_INVALID_OR_EXPIRED", "The approval is invalid, expired, stale, or already used.");
        }
        const tokenDigest = createHash("sha256").update(approvalToken, "utf8").digest("hex");
        try {
          claimed = await claimTaskWithApproval(Object.freeze({
            tokenDigest,
            principal,
            taskId: snapshot.taskId,
            taskVersion: snapshot.taskVersion,
            payloadHash: snapshot.payloadHash,
            agentId: snapshot.agentId,
            agentVersion: snapshot.agentVersion,
            capabilityId: snapshot.capabilityId,
            capabilityVersion: snapshot.capabilityVersion,
            fromStatus: "awaiting_approval",
            toStatus: "running",
          })) === true;
        } catch { claimed = false; }
        if (!claimed) {
          throw new ApprovedExecutionError("APPROVAL_OR_CLAIM_FAILED", "The approval is invalid or the task could not be atomically claimed.");
        }
      } else {
        const consumed = await approvalAuthority.consume({
          token: approvalToken, principal, taskId, action: "execute",
          capabilityId: snapshot.capabilityId,
          capabilityVersion: snapshot.capabilityVersion,
          taskVersion: snapshot.taskVersion,
          agentId: snapshot.agentId,
          agentVersion: snapshot.agentVersion,
          payloadHash: snapshot.payloadHash,
        });
        if (!consumed) {
          throw new ApprovedExecutionError("APPROVAL_INVALID_OR_EXPIRED", "The approval is invalid, expired, stale, or already used.");
        }
        try {
          claimed = await claimTaskForExecution(Object.freeze({
            taskId: snapshot.taskId,
            taskVersion: snapshot.taskVersion,
            payloadHash: snapshot.payloadHash,
            principal,
            agentId: snapshot.agentId,
            agentVersion: snapshot.agentVersion,
            capabilityId: snapshot.capabilityId,
            capabilityVersion: snapshot.capabilityVersion,
          })) === true;
        } catch { claimed = false; }
        if (!claimed) throw new ApprovedExecutionError("TASK_CLAIM_FAILED", "The task could not be atomically claimed; the approval has been consumed.");
      }

      try {
        return await capabilityExecutor.run({
          agentId: snapshot.agentId,
          capabilityId: snapshot.capabilityId,
          input: snapshot.input,
          signal,
        });
      } catch {
        throw new ApprovedExecutionError("CAPABILITY_EXECUTION_FAILED", "The approved local capability could not be completed. The approval has been consumed.");
      }
    } finally {
      activeExecutions -= 1;
    }
  }

  return Object.freeze({ requestApproval, executeApproved });
}
