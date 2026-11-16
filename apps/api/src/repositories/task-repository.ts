import {inTenantTransaction} from "./tenant-context.js";

export type TaskInput = {
  agentId?: string;
  input: Record<string, unknown>;
  idempotencyKey: string;
};

export class TaskIdempotencyConflictError extends Error {
  constructor() {
    super("The idempotency key was already used with a different task request.");
    this.name = "TaskIdempotencyConflictError";
  }
}

export class TaskAgentNotFoundError extends Error {
  constructor() {
    super("The requested agent does not exist in the authenticated tenant.");
    this.name = "TaskAgentNotFoundError";
  }
}

export class TaskIdempotencyLookupError extends Error {
  constructor() {
    super("The task idempotency conflict could not be resolved.");
    this.name = "TaskIdempotencyLookupError";
  }
}

export async function createTask(issuer: string, subject: string, value: TaskInput) {
  return inTenantTransaction(issuer, subject, async (client, identity) => {
    if (value.agentId) {
      const agent = await client.query(
        "SELECT id FROM agents WHERE id = $1 AND tenant_id = $2 LIMIT 1",
        [value.agentId, identity.tenantId],
      );
      if (!agent.rows[0]) throw new TaskAgentNotFoundError();
    }

    const inserted = await client.query(
      `INSERT INTO tasks(tenant_id, agent_id, idempotency_key, input, created_by)
       VALUES($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT(tenant_id, idempotency_key) DO NOTHING
       RETURNING id, agent_id, idempotency_key, status, input, result, created_at, updated_at`,
      [
        identity.tenantId,
        value.agentId ?? null,
        value.idempotencyKey,
        JSON.stringify(value.input),
        identity.userId,
      ],
    );

    const createdTask = inserted.rows[0];
    if (createdTask) return {task: createdTask, created: true};

    // PostgreSQL JSONB equality compares JSON values, not serialized key order.
    const existing = await client.query(
      `SELECT id, agent_id, idempotency_key, status, input, result, created_at, updated_at,
              (input = $3::jsonb AND agent_id IS NOT DISTINCT FROM $4) AS request_matches
       FROM tasks
       WHERE tenant_id = $1 AND idempotency_key = $2
       LIMIT 1`,
      [
        identity.tenantId,
        value.idempotencyKey,
        JSON.stringify(value.input),
        value.agentId ?? null,
      ],
    );

    const existingTask = existing.rows[0];
    if (!existingTask) throw new TaskIdempotencyLookupError();
    if (!existingTask.request_matches) throw new TaskIdempotencyConflictError();

    const task = {...existingTask};
    delete task.request_matches;
    return {task, created: false};
  });
}

export async function listTasks(issuer: string, subject: string) {
  return inTenantTransaction(issuer, subject, async client => {
    const result = await client.query(
      "SELECT id, agent_id, idempotency_key, status, input, result, created_at, updated_at FROM tasks ORDER BY created_at DESC LIMIT 100",
    );
    return result.rows;
  });
}

export async function getTask(issuer: string, subject: string, id: string) {
  return inTenantTransaction(issuer, subject, async client => {
    const result = await client.query(
      "SELECT id, agent_id, idempotency_key, status, input, result, created_at, updated_at FROM tasks WHERE id = $1",
      [id],
    );
    return result.rows[0] ?? null;
  });
}

export async function cancelQueuedTask(issuer: string, subject: string, id: string) {
  return inTenantTransaction(issuer, subject, async client => {
    const result = await client.query(
      "UPDATE tasks SET status = 'cancelled', updated_at = now() WHERE id = $1 AND status = 'queued' RETURNING id, status, updated_at",
      [id],
    );
    return result.rows[0] ?? null;
  });
}
