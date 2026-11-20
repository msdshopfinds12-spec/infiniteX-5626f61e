import type { Json } from "../../lib/supabase/database.types";

export type WorkflowRunRequest = Readonly<{
  workflow_id: string;
  input: Json;
}>;

function cloneAndFreezeJson(value: unknown, ancestors: WeakSet<object>): Json {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Workflow input numbers must be finite.");
    }
    return value;
  }

  if (typeof value !== "object") {
    throw new TypeError("Workflow input must contain JSON-compatible values only.");
  }

  if (ancestors.has(value)) {
    throw new TypeError("Workflow input must not contain circular references.");
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const result = value.map((item) => cloneAndFreezeJson(item, ancestors));
      return Object.freeze(result);
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Workflow input objects must be plain JSON objects.");
    }

    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string")) {
      throw new TypeError("Workflow input objects must not contain symbol keys.");
    }

    const result: Record<string, Json> = {};
    for (const key of ownKeys as string[]) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        throw new TypeError("Workflow input must not contain accessors or hidden properties.");
      }

      Object.defineProperty(result, key, {
        value: cloneAndFreezeJson(descriptor.value, ancestors),
        enumerable: true,
        writable: false,
        configurable: false,
      });
    }

    return Object.freeze(result);
  } finally {
    ancestors.delete(value);
  }
}

/**
 * Creates an immutable, JSON-only request for a trusted server endpoint.
 *
 * This is intentionally not a database Insert type. The server must derive
 * owner_id from the verified session and set queued/worker-owned lifecycle
 * fields itself. Never insert workflow_runs directly from the browser.
 */
export function createWorkflowRunRequest(
  workflowId: string,
  input: Json = {},
): WorkflowRunRequest {
  const normalizedWorkflowId = workflowId.trim();
  if (!normalizedWorkflowId) {
    throw new TypeError("A workflow ID is required.");
  }

  return Object.freeze({
    workflow_id: normalizedWorkflowId,
    input: cloneAndFreezeJson(input, new WeakSet<object>()),
  });
}
