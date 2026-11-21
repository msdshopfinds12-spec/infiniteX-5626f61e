const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_SCOPES = new Set(["api:read", "api:write"]);

/**
 * @typedef {{ action: "list" } | { action: "create", label: string, scopes: Array<"api:read" | "api:write">, expiresInDays?: number } | { action: "revoke", id: string }} ApiKeyManagerRequest
 * @typedef {{ ok: true, value: ApiKeyManagerRequest } | { ok: false, error: string }} ApiKeyRequestParse
 */

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

/** Strict allowlist parser shared by the Edge Function and regression tests. */
/** @param {unknown} value @returns {ApiKeyRequestParse} */
export function parseApiKeyManagerRequest(value) {
  if (!isRecord(value)) return { ok: false, error: "invalid_json_object" };

  if (value.action === "list") {
    return hasOnlyKeys(value, ["action"])
      ? { ok: true, value: { action: "list" } }
      : { ok: false, error: "unsupported_request_field" };
  }

  if (value.action === "create") {
    if (!hasOnlyKeys(value, ["action", "label", "scopes", "expires_in_days"])) {
      return { ok: false, error: "unsupported_request_field" };
    }
    const label = typeof value.label === "string" ? value.label.trim() : "";
    if (label.length < 1 || label.length > 100) {
      return { ok: false, error: "label_length_invalid" };
    }

    const scopes = value.scopes === undefined ? ["api:read"] : value.scopes;
    if (!Array.isArray(scopes) || scopes.length < 1 || scopes.length > 2
      || scopes.some((scope) => typeof scope !== "string" || !ALLOWED_SCOPES.has(scope))
      || new Set(scopes).size !== scopes.length) {
      return { ok: false, error: "invalid_scopes" };
    }

    let expiresInDays;
    if (value.expires_in_days !== undefined) {
      if (typeof value.expires_in_days !== "number"
        || !Number.isInteger(value.expires_in_days)
        || value.expires_in_days < 1 || value.expires_in_days > 365) {
        return { ok: false, error: "expires_in_days_must_be_1_to_365" };
      }
      expiresInDays = value.expires_in_days;
    }

    return {
      ok: true,
      value: {
        action: "create",
        label,
        scopes,
        ...(expiresInDays === undefined ? {} : { expiresInDays }),
      },
    };
  }

  if (value.action === "revoke") {
    if (!hasOnlyKeys(value, ["action", "id"])) {
      return { ok: false, error: "unsupported_request_field" };
    }
    if (typeof value.id !== "string" || !UUID_PATTERN.test(value.id)) {
      return { ok: false, error: "invalid_key_id" };
    }
    return { ok: true, value: { action: "revoke", id: value.id } };
  }

  return { ok: false, error: "unsupported_action" };
}
