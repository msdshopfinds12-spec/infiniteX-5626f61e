export const WORKFLOW_API_MAX_BODY_BYTES = 16 * 1024;
export const WORKFLOW_API_MAX_JSON_DEPTH = 12;
export const WORKFLOW_API_MAX_JSON_NODES = 1_000;
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;\nconst UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function inspectJson(value, depth, budget) {
  budget.nodes += 1;
  if (budget.nodes > WORKFLOW_API_MAX_JSON_NODES) return "input_too_complex";
  if (depth > WORKFLOW_API_MAX_JSON_DEPTH) return "input_too_deep";
  if (value === null || typeof value === "string" || typeof value === "boolean") return null;
  if (typeof value === "number") return Number.isFinite(value) ? null : "input_invalid_number";
  if (Array.isArray(value)) {
    if (value.length > 100) return "input_array_too_large";
    for (const item of value) {
      const error = inspectJson(item, depth + 1, budget);
      if (error) return error;
    }
    return null;
  }
  if (!isRecord(value)) return "input_must_be_json";
  const keys = Object.keys(value);
  if (keys.length > 100) return "input_object_too_large";
  for (const key of keys) {
    if (key === "__proto__" || key === "prototype" || key === "constructor") {
      return "input_contains_forbidden_key";
    }
    const error = inspectJson(value[key], depth + 1, budget);
    if (error) return error;
  }
  return null;
}

export function validateIdempotencyKey(value) {
  return typeof value === "string" && IDEMPOTENCY_KEY_PATTERN.test(value);
}

/** Validate only browser-owned business fields; ownership and lifecycle are server-derived. */
export function validateEnqueueWorkflowRequest(value) {
  if (!isRecord(value)) return { ok: false, code: "invalid_request_body" };
  if (Object.keys(value).some((key) => key !== "workflow_id" && key !== "input")) {
    return { ok: false, code: "unknown_or_forbidden_field" };
  }
  if (typeof value.workflow_id !== "string" ||
      value.workflow_id.trim().length === 0 ||
      value.workflow_id.length > 128) {
    return { ok: false, code: "invalid_workflow_id" };
  }
  const input = value.input === undefined ? {} : value.input;
  const inputError = inspectJson(input, 0, { nodes: 0 });
  if (inputError) return { ok: false, code: inputError };
  let serialized;
  try {
    serialized = JSON.stringify(input);
  } catch {
    return { ok: false, code: "input_must_be_json" };
  }
  if (typeof serialized !== "string") return { ok: false, code: "input_must_be_json" };
  if (new TextEncoder().encode(serialized).byteLength > WORKFLOW_API_MAX_BODY_BYTES) {
    return { ok: false, code: "input_too_large" };
  }
  return {
    ok: true,
    value: Object.freeze({ workflow_id: value.workflow_id.trim(), input }),
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Parse only the function's exact routes; reject unrelated paths and extra segments. */
export function parseWorkflowApiRoute(pathname) {
  if (typeof pathname !== "string") return null;
  const segments = pathname.split("/").filter(Boolean);
  let routeSegments = segments;

  if (segments[0] === "functions") {
    if (segments.length < 4 ||
        segments[1] !== "v1" ||
        segments[2] !== "simula-workflow-api" ||
        segments[3] !== "runs") return null;
    routeSegments = segments.slice(3);
  }

  if (routeSegments[0] !== "runs") return null;
  if (routeSegments.length === 1) return { resource: "runs" };
  if (routeSegments.length > 3 || !UUID_PATTERN.test(routeSegments[1])) return null;

  const runId = routeSegments[1].toLowerCase();
  if (routeSegments.length === 2) return { resource: "run", runId };
  if (routeSegments[2] === "cancel") return { resource: "cancel", runId };
  return null;
}
