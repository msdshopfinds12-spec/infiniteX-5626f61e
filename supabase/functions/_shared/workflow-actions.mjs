/** Pure, deterministic workflow action executor shared by authenticated and cron workers. */

function record(value) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return { ...value };
  }
  return { value };
}

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(label + "_must_be_non_empty_string");
  }
  return value;
}

export function executeSafeAction(actionType, input, config) {
  const data = record(input);
  const safeConfig = record(config);

  switch (actionType) {
    case "pass_through":
      return data;

    case "set_value": {
      const key = requiredString(safeConfig.key, "config.key");
      if (!Object.prototype.hasOwnProperty.call(safeConfig, "value")) {
        throw new Error("config.value_required");
      }
      return { ...data, [key]: safeConfig.value };
    }

    case "merge_json": {
      const value = safeConfig.value;
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("config.value_must_be_json_object");
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
      const current = data[key];
      if (typeof current !== "string") {
        throw new Error("input_text_field_required:" + key);
      }
      let next = current;
      if (actionType === "uppercase_text") next = current.toUpperCase();
      if (actionType === "lowercase_text") next = current.toLowerCase();
      if (actionType === "append_text") next = current + requiredString(safeConfig.text, "config.text");
      if (actionType === "prepend_text") next = requiredString(safeConfig.text, "config.text") + current;
      return { ...data, [key]: next };
    }

    default:
      throw new Error("unsupported_action_type:" + actionType);
  }
}
