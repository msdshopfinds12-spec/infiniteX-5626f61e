import test from "node:test";
import assert from "node:assert/strict";
import { createTask, transitionTask, TaskLifecycleError } from "../server/integrations/task-lifecycle.mjs";

const at = "2026-11-19T10:00:00.000Z";
const command = (task, name, actor, offset = 0) => transitionTask(task, name, {
  expectedVersion: task.version, actor,
  at: new Date(Date.parse(at) + offset * 1000).toISOString(),
});

test("creates immutable queued task with version zero", () => {
  const task = createTask({ id: "task_1", title: "  Review architecture  ", createdAt: at });
  assert.equal(task.title, "Review architecture");
  assert.equal(task.state, "queued");
  assert.equal(task.version, 0);
  assert.equal(Object.isFrozen(task), true);
  assert.equal(Object.isFrozen(task.events), true);
});

test("requires human approval before execution", () => {
  let task = createTask({ id: "task_2", title: "Run checks", createdAt: at });
  task = command(task, "begin_planning", "system", 1);
  task = command(task, "request_approval", "system", 2);
  assert.throws(() => command(task, "begin_execution", "system", 3),
    (error) => error.code === "UNKNOWN_COMMAND" || error.code === "INVALID_TRANSITION");
  task = command(task, "approve", "user", 3);
  task = command(task, "begin_execution", "system", 4);
  assert.equal(task.state, "running");
  assert.equal(task.approval, "approved");
});

test("rejects system approval and user execution", () => {
  let task = createTask({ id: "task_3", title: "Review", createdAt: at });
  task = command(task, "begin_planning", "system", 1);
  task = command(task, "request_approval", "system", 2);
  assert.throws(() => command(task, "approve", "system", 3),
    (error) => error instanceof TaskLifecycleError && error.code === "ACTOR_NOT_ALLOWED");
});

test("uses optimistic version checks to reject stale writes", () => {
  const task = createTask({ id: "task_4", title: "Review", createdAt: at });
  assert.throws(() => transitionTask(task, "begin_planning", {
    expectedVersion: 9, actor: "system", at,
  }), (error) => error.code === "VERSION_CONFLICT");
});

test("rejects invalid transitions, terminal transitions and backward timestamps", () => {
  const task = createTask({ id: "task_5", title: "Review", createdAt: at });
  assert.throws(() => command(task, "complete", "system", 1),
    (error) => error.code === "INVALID_TRANSITION");
  const cancelled = command(task, "cancel", "user", 1);
  assert.equal(cancelled.state, "cancelled");
  assert.throws(() => command(cancelled, "begin_planning", "system", 2),
    (error) => error.code === "TERMINAL_TASK");
  assert.throws(() => transitionTask(task, "begin_planning", {
    expectedVersion: 0, actor: "system", at: "2026-11-18T10:00:00.000Z",
  }), (error) => error.code === "INVALID_TIMESTAMP");
});

test("records an append-only, sequenced transition history", () => {
  let task = createTask({ id: "task_6", title: "Review", createdAt: at });
  task = command(task, "begin_planning", "system", 1);
  task = command(task, "request_approval", "system", 2);
  assert.deepEqual(task.events.map((event) => event.sequence), [1, 2]);
  assert.equal(task.events[1].from, "planning");
  assert.equal(task.events[1].to, "awaiting_approval");
  assert.equal(Object.isFrozen(task.events[1]), true);
});
