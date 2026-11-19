import type { TaskRecord } from "./task-lifecycle.mjs";

export class TaskRepositoryError extends Error {
  readonly code: string;
}
export interface InMemoryTaskRepository {
  create(input: { id: string; title: string; createdAt: string }): TaskRecord;
  get(taskId: string): TaskRecord | null;
  list(): readonly TaskRecord[];
  listEvents(taskId: string): TaskRecord["events"] | null;
  transition(input: {
    taskId: string;
    command: string;
    expectedVersion: number;
    actor: "system" | "user";
    at: string;
  }): TaskRecord;
  readonly size: number;
}
export function createInMemoryTaskRepository(options?: {
  maxTasks?: number;
  maxEventsPerTask?: number;
}): InMemoryTaskRepository;
