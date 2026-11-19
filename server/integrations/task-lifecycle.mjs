// Shared deterministic state machine. Authentication and actor derivation remain server responsibilities.
export { createTask, transitionTask, TaskLifecycleError, TASK_STATES } from "../../src/lib/task-lifecycle.mjs";
