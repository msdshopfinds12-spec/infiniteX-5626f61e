/** Runtime-neutral, side-effect-free workflow action domain. */
export class WorkflowActionError extends Error {
  constructor(code) {
    super(code);
    this.name = "WorkflowActionError";
    this.code = code;
  }
}

export function normalizeRecord(value) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return { ...value };
  }
  return { value };
}

function requiredString(value, code) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new WorkflowActionError(code);
  }
  return value;
}

/**
 * Executes only the seven built-in deterministic JSON transformations.
 * It performs no I/O, dynamic evaluation, provider calls, or persistence.
 */
export function executeSafeAction(actionType, input, config = {}) {
  const data = normalizeRecord(input);
  const safeConfig = normalizeRecord(config);

  switch (actionType) {
    case "pass_through":
      return data;

    case "set_value": {
      const key = requiredString(safeConfig.key, "config_key_invalid");
      if (!Object.prototype.hasOwnProperty.call(safeConfig, "value")) {
        throw new WorkflowActionError("config_value_required");
      }
      return { ...data, [key]: safeConfig.value };
    }

    case "merge_json": {
      const value = safeConfig.value;
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new WorkflowActionError("config_value_must_be_json_object");
      }
      return { ...data, ...value };
    }

    case "uppercase_text":
    case "lowercase_text":
    case "append_text":
    case "prepend_text": {
      const key = typeof safeConfig.key === "string" && safeConfig.key.trim()
        ? safeConfig.key
        : "text";
      const current = Object.prototype.hasOwnProperty.call(data, key) ? data[key] : undefined;
      if (typeof current !== "string") {
        throw new WorkflowActionError("input_text_field_required");
      }
      let next = current;
      if (actionType === "uppercase_text") next = current.toUpperCase();
      if (actionType === "lowercase_text") next = current.toLowerCase();
      if (actionType === "append_text") {
        next = current + requiredString(safeConfig.text, "config_text_invalid");
      }
      if (actionType === "prepend_text") {
        next = requiredString(safeConfig.text, "config_text_invalid") + current;
      }
      return { ...data, [key]: next };
    }

    default:
      throw new WorkflowActionError("unsupported_action_type");
  }
}

/** Convert arbitrary thrown values into bounded, non-sensitive error codes. */
export function toSafeActionError(error) {
  if (error instanceof WorkflowActionError && /^[a-z0-9_]{1,64}$/.test(error.code)) {
    return error.code;
  }
  return "action_failed";
}
