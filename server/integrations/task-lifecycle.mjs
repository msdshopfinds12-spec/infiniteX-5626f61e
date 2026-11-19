/**
 * Deterministic task lifecycle. This module records state only; it never runs tools.
 * Side effects must live behind separately reviewed adapters and human approval.
 */
const STATES = new Set(["queued", "planning", "awaiting_approval", "approved", "running", "succeeded", "failed", "cancelled"]);
const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);
const isIsoUtc = (value) => typeof value === "string" && !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const COMMANDS = Object.freeze({
  begin_planning: { from: "queued", to: "planning", actor: "system" },
  request_approval: { from: "planning", to: "awaiting_approval", actor: "system" },
  approve: { from: "awaiting_approval", to: "approved", actor: "user" },
  reject: { from: "awaiting_approval", to: "cancelled", actor: "user" },
  begin_execution: { from: "approved", to: "running", actor: "system" },
  complete: { from: "running", to: "succeeded", actor: "system" },
  fail: { from: "running", to: "failed", actor: "system" },
  cancel: { from: "queued", to: "cancelled", actor: "user" },
});

export class TaskLifecycleError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TaskLifecycleError";
    this.code = code;
  }
}

export function createTask({ id, title, createdAt }) {
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
    throw new TaskLifecycleError("INVALID_ID", "Task id must be a 1–64 character safe identifier.");
  }
  if (typeof title !== "string" || title.trim().length < 1 || title.trim().length > 160) {
    throw new TaskLifecycleError("INVALID_TITLE", "Task title must contain 1–160 characters.");
  }
  if (!isIsoUtc(createdAt)) {
    throw new TaskLifecycleError("INVALID_TIMESTAMP", "createdAt must be a valid ISO-compatible timestamp.");
  }
  return Object.freeze({
    id,
    title: title.trim(),
    state: "queued",
    version: 0,
    approval: "not_requested",
    createdAt,
    updatedAt: createdAt,
    events: Object.freeze([]),
  });
}

export function transitionTask(task, command, { expectedVersion, actor, at } = {}) {
  if (!task || typeof task !== "object" || !STATES.has(task.state) ||
      !Number.isInteger(task.version) || task.version < 0 || !Array.isArray(task.events) ||
      !isIsoUtc(task.updatedAt) || typeof task.id !== "string") {
    throw new TaskLifecycleError("INVALID_TASK", "A valid task state is required.");
  }
  if (TERMINAL.has(task.state)) {
    throw new TaskLifecycleError("TERMINAL_TASK", "Terminal tasks cannot transition.");
  }
  if (!Number.isInteger(expectedVersion) || expectedVersion !== task.version) {
    throw new TaskLifecycleError("VERSION_CONFLICT", "Task version is stale; reload before retrying.");
  }
  const rule = command === "cancel"
    ? { from: task.state, to: "cancelled", actor: "user" }
    : COMMANDS[command];
  if (!rule) throw new TaskLifecycleError("UNKNOWN_COMMAND", "Task command is not supported.");
  if (task.state !== rule.from) {
    throw new TaskLifecycleError("INVALID_TRANSITION", "Command is not valid for the current task state.");
  }
  if (actor !== rule.actor) {
    throw new TaskLifecycleError("ACTOR_NOT_ALLOWED", "This command requires a different actor.");
  }
  if (!isIsoUtc(at) || Date.parse(at) < Date.parse(task.updatedAt)) {
    throw new TaskLifecycleError("INVALID_TIMESTAMP", "Transition timestamp must be valid and non-decreasing.");
  }

  const approval = command === "approve" ? "approved"
    : command === "reject" ? "rejected"
      : task.approval;
  const event = Object.freeze({
    sequence: task.version + 1,
    command,
    from: task.state,
    to: rule.to,
    actor,
    at,
  });
  return Object.freeze({
    ...task,
    state: rule.to,
    approval,
    version: task.version + 1,
    updatedAt: at,
    events: Object.freeze([...task.events, event]),
  });
}

export const TASK_STATES = Object.freeze([...STATES]);
