import { ApprovalAuthorityError } from "./approval-authority.mjs";

export class ApprovedExecutionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ApprovedExecutionError";
    this.code = code;
  }
}

/**
 * Composes approval grants with the local capability executor.
 *
 * This service is NOT authentication middleware or an HTTP route. The caller
 * must supply a principal produced by trusted authentication middleware and
 * server-owned task state. authorize() must enforce the caller's permission
 * for the requested operation. isTaskAwaitingApproval() must read trusted
 * server-side task state. Never pass browser-supplied principal/role/task state.
 *
 * Approval is consumed before execution. If execution fails, the grant remains
 * spent; this deliberately favors fail-closed behavior over automatic replay.
 */
export function createApprovedCapabilityService({
  approvalAuthority,
  capabilityExecutor,
  authorize,
  isTaskAwaitingApproval,
  claimTaskForExecution,
  maxConcurrentExecutions = 4,
} = {}) {
  if (!approvalAuthority ||
      typeof approvalAuthority.issue !== "function" ||
      typeof approvalAuthority.consume !== "function") {
    throw new TypeError("A valid approval authority is required.");
  }
  if (!capabilityExecutor || typeof capabilityExecutor.run !== "function") {
    throw new TypeError("A valid capability executor is required.");
  }
  if (typeof authorize !== "function" || typeof isTaskAwaitingApproval !== "function" ||
      typeof claimTaskForExecution !== "function") {
    throw new TypeError("Server-side authorization, task-state, and atomic claim callbacks are required.");
  }

  if (!Number.isSafeInteger(maxConcurrentExecutions) || maxConcurrentExecutions < 1 || maxConcurrentExecutions > 100) {
    throw new TypeError("maxConcurrentExecutions must be an integer between 1 and 100.");
  }

  let activeExecutions = 0;

  async function isAllowed(principal, operation, taskId, capabilityId) {
    try {
      return await authorize(principal, Object.freeze({
        operation,
        taskId,
        capabilityId,
      })) === true;
    } catch {
      return false;
    }
  }

  async function requestApproval({
    principal,
    taskId,
    capabilityId,
    capabilityVersion,
  } = {}) {
    if (!await isAllowed(principal, "approve", taskId, capabilityId)) {
      throw new ApprovedExecutionError("APPROVAL_FORBIDDEN", "The principal is not authorized to approve this task.");
    }
    let awaiting = false;
    try {
      awaiting = await isTaskAwaitingApproval(taskId, principal) === true;
    } catch {
      awaiting = false;
    }
    if (!awaiting) {
      throw new ApprovedExecutionError("TASK_NOT_AWAITING_APPROVAL", "The task is not awaiting approval.");
    }
    try {
      return approvalAuthority.issue({
        principal,
        taskId,
        action: "execute",
        capabilityId,
        capabilityVersion,
      });
    } catch (error) {
      if (error instanceof ApprovalAuthorityError) {
        throw new ApprovedExecutionError(error.code, "An approval grant could not be issued.");
      }
      throw new ApprovedExecutionError("APPROVAL_ISSUE_FAILED", "An approval grant could not be issued.");
    }
  }

  async function executeApproved({
    principal,
    taskId,
    agentId,
    capabilityId,
    capabilityVersion,
    approvalToken,
    input,
    signal,
  } = {}) {
    if (!await isAllowed(principal, "execute", taskId, capabilityId)) {
      throw new ApprovedExecutionError("EXECUTION_FORBIDDEN", "The principal is not authorized to execute this task.");
    }
    let awaiting = false;
    try {
      awaiting = await isTaskAwaitingApproval(taskId, principal) === true;
    } catch {
      awaiting = false;
    }
    if (!awaiting) {
      throw new ApprovedExecutionError("TASK_NOT_AWAITING_APPROVAL", "The task is not awaiting approval.");
    }

    if (signal !== undefined && (!signal || typeof signal.aborted !== "boolean")) {
      throw new ApprovedExecutionError("INVALID_SIGNAL", "signal must be an AbortSignal.");
    }
    if (signal?.aborted) {
      throw new ApprovedExecutionError("ABORTED", "The approved execution was cancelled before it started.");
    }
    if (activeExecutions >= maxConcurrentExecutions) {
      throw new ApprovedExecutionError("EXECUTION_CAPACITY_EXCEEDED", "The local execution capacity is full; retry after an active task finishes.");
    }

    // JavaScript executes this reservation synchronously, so concurrent callers
    // cannot pass the capacity check before the counter is incremented.
    activeExecutions += 1;
    try {
      const consumed = approvalAuthority.consume({
        token: approvalToken,
        principal,
        taskId,
        action: "execute",
        capabilityId,
        capabilityVersion,
      });
      if (!consumed) {
        throw new ApprovedExecutionError("APPROVAL_INVALID_OR_EXPIRED", "The approval is invalid, expired, or already used.");
      }

      let claimed = false;
      try {
        claimed = await claimTaskForExecution(Object.freeze({ taskId, principal, capabilityId })) === true;
      } catch {
        claimed = false;
      }
      if (!claimed) {
        throw new ApprovedExecutionError("TASK_CLAIM_FAILED", "The task could not be atomically claimed; the approval has been consumed.");
      }

      try {
        return await capabilityExecutor.run({
          agentId,
          capabilityId,
          input,
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
