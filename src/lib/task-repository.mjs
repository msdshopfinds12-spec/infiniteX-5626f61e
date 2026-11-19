import { createTask, transitionTask, TaskLifecycleError } from "../../src/lib/task-lifecycle.mjs";

export class TaskRepositoryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TaskRepositoryError";
    this.code = code;
  }
}

/**
 * Bounded, process-local task repository for development and tests.
 *
 * This adapter is intentionally synchronous: each create/transition operation
 * completes its read-check-write sequence in one JavaScript turn. It is NOT a
 * distributed transaction, durable store, authenticated API, or multi-process
 * concurrency primitive. Never expose actor as a client-controlled field.
 */
export function createInMemoryTaskRepository({
  maxTasks = 1_000,
  maxEventsPerTask = 500,
} = {}) {
  if (!Number.isSafeInteger(maxTasks) || maxTasks < 1 || maxTasks > 100_000) {
    throw new TypeError("maxTasks must be an integer between 1 and 100000.");
  }
  if (!Number.isSafeInteger(maxEventsPerTask) || maxEventsPerTask < 1 || maxEventsPerTask > 10_000) {
    throw new TypeError("maxEventsPerTask must be an integer between 1 and 10000.");
  }

  const tasks = new Map();

  function create(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new TaskRepositoryError("INVALID_TASK_INPUT", "A task input object is required.");
    }
    if (tasks.has(input.id)) {
      throw new TaskRepositoryError("TASK_ALREADY_EXISTS", "A task with this identifier already exists.");
    }
    if (tasks.size >= maxTasks) {
      throw new TaskRepositoryError("REPOSITORY_CAPACITY_EXCEEDED", "The in-memory task repository is full.");
    }

    let task;
    try {
      task = createTask(input);
    } catch (error) {
      if (error instanceof TaskLifecycleError) {
        throw new TaskRepositoryError(error.code, error.message);
      }
      throw new TaskRepositoryError("TASK_CREATE_FAILED", "The task could not be created.");
    }
    tasks.set(task.id, task);
    return task;
  }

  function get(taskId) {
    return tasks.get(taskId) ?? null;
  }

  function list() {
    return Object.freeze([...tasks.values()]);
  }

  function listEvents(taskId) {
    const task = get(taskId);
    if (!task) return null;
    return task.events;
  }

  function transition({ taskId, command, expectedVersion, actor, at } = {}) {
    const current = get(taskId);
    if (!current) {
      throw new TaskRepositoryError("TASK_NOT_FOUND", "The requested task does not exist.");
    }
    if (current.events.length >= maxEventsPerTask) {
      throw new TaskRepositoryError("EVENT_CAPACITY_EXCEEDED", "The task event history reached its configured limit.");
    }

    let next;
    try {
      next = transitionTask(current, command, { expectedVersion, actor, at });
    } catch (error) {
      if (error instanceof TaskLifecycleError) {
        throw new TaskRepositoryError(error.code, error.message);
      }
      throw new TaskRepositoryError("TASK_TRANSITION_FAILED", "The task transition could not be completed.");
    }

    // No await occurs between reading current and replacing it. This is atomic
    // only within this process and event loop; durable adapters need DB CAS/transactions.
    tasks.set(taskId, next);
    return next;
  }

  return Object.freeze({
    create,
    get,
    list,
    listEvents,
    transition,
    get size() {
      return tasks.size;
    },
  });
}
