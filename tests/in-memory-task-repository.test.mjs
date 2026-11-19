import test from "node:test";
import assert from "node:assert/strict";
import { createInMemoryTaskRepository, TaskRepositoryError } from "../src/lib/task-repository.mjs";

const createdAt = "2026-11-19T10:00:00.000Z";
const taskInput = (id = "task_1") => ({ id, title: "Review architecture", createdAt });
const transition = (repository, taskId, command, actor, expectedVersion, offset = 1) =>
  repository.transition({
    taskId,
    command,
    actor,
    expectedVersion,
    at: new Date(Date.parse(createdAt) + offset * 1_000).toISOString(),
  });

test("creates immutable task snapshots and returns null for missing tasks", () => {
  const repository = createInMemoryTaskRepository();
  const task = repository.create(taskInput());
  assert.equal(task.state, "queued");
  assert.equal(repository.get(task.id), task);
  assert.equal(repository.get("missing"), null);
  assert.equal(Object.isFrozen(repository.list()), true);
  assert.equal(Object.isFrozen(task), true);
  assert.equal(repository.size, 1);
});

test("rejects duplicate IDs and enforces the configured task capacity", () => {
  const repository = createInMemoryTaskRepository({ maxTasks: 1 });
  repository.create(taskInput());
  assert.throws(() => repository.create(taskInput()), (error) =>
    error instanceof TaskRepositoryError && error.code === "TASK_ALREADY_EXISTS");
  assert.throws(() => repository.create(taskInput("task_2")), (error) =>
    error.code === "REPOSITORY_CAPACITY_EXCEEDED");
});

test("appends ordered lifecycle events and exposes immutable event history", () => {
  const repository = createInMemoryTaskRepository();
  repository.create(taskInput());
  transition(repository, "task_1", "begin_planning", "system", 0, 1);
  transition(repository, "task_1", "request_approval", "system", 1, 2);
  const events = repository.listEvents("task_1");
  assert.deepEqual(events.map((event) => event.sequence), [1, 2]);
  assert.equal(events[1].from, "planning");
  assert.equal(events[1].to, "awaiting_approval");
  assert.equal(Object.isFrozen(events), true);
  assert.equal(Object.isFrozen(events[0]), true);
  assert.equal(repository.listEvents("missing"), null);
});

test("requires explicit approval and optimistic version checks before execution", () => {
  const repository = createInMemoryTaskRepository();
  repository.create(taskInput());
  transition(repository, "task_1", "begin_planning", "system", 0, 1);
  transition(repository, "task_1", "request_approval", "system", 1, 2);
  assert.throws(() => transition(repository, "task_1", "begin_execution", "system", 2, 3),
    (error) => error.code === "INVALID_TRANSITION");
  assert.throws(() => transition(repository, "task_1", "approve", "user", 0, 3),
    (error) => error.code === "VERSION_CONFLICT");
  transition(repository, "task_1", "approve", "user", 2, 3);
  const running = transition(repository, "task_1", "begin_execution", "system", 3, 4);
  assert.equal(running.state, "running");
  assert.equal(running.version, 4);
});

test("rejects unknown tasks, malformed inputs and invalid repository limits", () => {
  assert.throws(() => createInMemoryTaskRepository({ maxTasks: 0 }), /maxTasks/);
  assert.throws(() => createInMemoryTaskRepository({ maxEventsPerTask: 0 }), /maxEventsPerTask/);
  const repository = createInMemoryTaskRepository();
  assert.throws(() => repository.create(null), (error) => error.code === "INVALID_TASK_INPUT");
  assert.throws(() => transition(repository, "missing", "begin_planning", "system", 0),
    (error) => error.code === "TASK_NOT_FOUND");
});

test("enforces a per-task event bound without corrupting the last valid snapshot", () => {
  const repository = createInMemoryTaskRepository({ maxEventsPerTask: 1 });
  repository.create(taskInput());
  const first = transition(repository, "task_1", "begin_planning", "system", 0, 1);
  assert.equal(first.version, 1);
  assert.throws(() => transition(repository, "task_1", "request_approval", "system", 1, 2),
    (error) => error.code === "EVENT_CAPACITY_EXCEEDED");
  assert.equal(repository.get("task_1").state, "planning");
  assert.equal(repository.get("task_1").version, 1);
  assert.equal(repository.listEvents("task_1").length, 1);
});

test("keeps terminal states immutable and never deletes historical events", () => {
  const repository = createInMemoryTaskRepository();
  repository.create(taskInput());
  transition(repository, "task_1", "cancel", "user", 0, 1);
  assert.throws(() => transition(repository, "task_1", "begin_planning", "system", 1, 2),
    (error) => error.code === "TERMINAL_TASK");
  assert.equal(repository.listEvents("task_1").length, 1);
  assert.equal(repository.get("task_1").state, "cancelled");
});
