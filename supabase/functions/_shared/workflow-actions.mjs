/** Pure, runtime-neutral allowlisted workflow actions shared by both Edge workers. */

export function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? { ...value }
    : { value };
}

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(label + "_must_be_non_empty_string");
  }
  return value;
}

/**
 * Executes only deterministic local JSON transformations.
 * External I/O, dynamic imports, eval, and arbitrary code execution are intentionally unsupported.
 */
export function executeSafeAction(actionType, input, config) {
  const data = record(input);
  const options = record(config);

  switch (actionType) {
    case "pass_through":
      return data;

    case "set_value": {
      const key = requiredString(options.key, "config.key");
      if (!Object.prototype.hasOwnProperty.call(options, "value")) {
        throw new Error("config.value_required");
      }
      return { ...data, [key]: options.value };
    }

    case "merge_json": {
      const value = options.value;
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("config.value_must_be_json_object");
      }
      return { ...data, ...value };
    }

    case "uppercase_text":
    case "lowercase_text":
    case "append_text":
    case "prepend_text": {
      const key = typeof options.key === "string" && options.key.trim()
        ? options.key
        : "text";
      const current = data[key];
      if (typeof current !== "string") {
        throw new Error("input_text_field_required:" + key);
      }
      let next = current;
      if (actionType === "uppercase_text") next = current.toUpperCase();
      if (actionType === "lowercase_text") next = current.toLowerCase();
      if (actionType === "append_text") {
        next = current + requiredString(options.text, "config.text");
      }
      if (actionType === "prepend_text") {
        next = requiredString(options.text, "config.text") + current;
      }
      return { ...data, [key]: next };
    }

    default:
      throw new Error("unsupported_action_type:" + String(actionType));
  }
}
