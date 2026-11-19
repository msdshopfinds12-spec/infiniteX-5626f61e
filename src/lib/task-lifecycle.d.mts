export type TaskState = "queued" | "planning" | "awaiting_approval" | "approved" | "running" | "succeeded" | "failed" | "cancelled";
export type TaskApproval = "not_requested" | "approved" | "rejected";
export interface TaskEvent {
  readonly sequence: number;
  readonly command: string;
  readonly from: TaskState;
  readonly to: TaskState;
  readonly actor: "system" | "user";
  readonly at: string;
}
export interface TaskRecord {
  readonly id: string;
  readonly title: string;
  readonly state: TaskState;
  readonly version: number;
  readonly approval: TaskApproval;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly events: readonly TaskEvent[];
}
export class TaskLifecycleError extends Error { readonly code: string; }
export function createTask(input: { id: string; title: string; createdAt: string }): TaskRecord;
export function transitionTask(
  task: TaskRecord,
  command: string,
  options: { expectedVersion: number; actor: "system" | "user"; at: string },
): TaskRecord;
export const TASK_STATES: readonly TaskState[];
