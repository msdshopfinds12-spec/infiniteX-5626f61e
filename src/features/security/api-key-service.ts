import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types.ts";
import { API_KEY_METADATA_COLUMNS, type ApiKeyMetadata } from "./api-key-metadata.ts";

export type ApiKeyRecord = Pick<
  ApiKeyMetadata,
  "id" | "label" | "key_prefix" | "scopes" | "expires_at" | "created_at"
>;

export type ApiKeyScope = "api:read" | "api:write";

export type ApiKeyServiceErrorCode =
  | "invalid_label"
  | "invalid_scopes"
  | "invalid_expiration"
  | "invalid_key_id"
  | "request_failed"
  | "network_unavailable"
  | "invalid_response";

export type ApiKeyServiceResult<T> =
  | Readonly<{ status: "success"; data: T }>
  | Readonly<{ status: "error"; code: ApiKeyServiceErrorCode }>;

type ApiKeyManagerResponse =
  | Readonly<{ ok: true; keys: ApiKeyMetadata[] }>
  | Readonly<{ ok: true; key: string; record: ApiKeyRecord; warning: string }>
  | Readonly<{ ok: true; revoked: Pick<ApiKeyMetadata, "id" | "revoked_at"> }>
  | Readonly<{ ok: false; error: string }>;

type ApiKeyClient = Pick<SupabaseClient<Database>, "functions">;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_SCOPES = new Set<ApiKeyScope>(["api:read", "api:write"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isApiKeyMetadata(value: unknown): value is ApiKeyMetadata {
  if (!isRecord(value)) return false;
  const allowedKeys = API_KEY_METADATA_COLUMNS as readonly string[];
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) return false;
  return typeof value.id === "string"
    && typeof value.label === "string"
    && typeof value.key_prefix === "string"
    && Array.isArray(value.scopes)
    && value.scopes.every((scope) => typeof scope === "string")
    && isNullableString(value.expires_at)
    && isNullableString(value.last_used_at)
    && isNullableString(value.revoked_at)
    && typeof value.created_at === "string";
}

function isApiKeyRecord(value: unknown): value is ApiKeyRecord {
  if (!isRecord(value)) return false;
  const allowedKeys = ["id", "label", "key_prefix", "scopes", "expires_at", "created_at"];
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) return false;
  return typeof value.id === "string"
    && typeof value.label === "string"
    && typeof value.key_prefix === "string"
    && Array.isArray(value.scopes)
    && value.scopes.every((scope) => typeof scope === "string")
    && isNullableString(value.expires_at)
    && typeof value.created_at === "string";
}

/**
 * Browser adapter for the authenticated API-key Edge Function.
 * The browser never reads or writes platform_api_keys directly and never
 * receives key_hash. The server derives owner identity from the verified JWT.
 */
export function createApiKeyService(client: ApiKeyClient) {
  async function invoke<T>(
    body: Record<string, unknown>,
    validate: (value: unknown) => value is T,
  ): Promise<ApiKeyServiceResult<T>> {
    try {
      const { data, error } = await client.functions.invoke<ApiKeyManagerResponse>(
        "ashaa-api-key-manager",
        { body },
      );
      if (error) return { status: "error", code: "request_failed" };
      if (!validate(data)) return { status: "error", code: "invalid_response" };
      return { status: "success", data };
    } catch {
      return { status: "error", code: "network_unavailable" };
    }
  }

  return Object.freeze({
    async list(): Promise<ApiKeyServiceResult<readonly ApiKeyMetadata[]>> {
      const result = await invoke(
        { action: "list" },
        (value): value is Extract<ApiKeyManagerResponse, { keys: ApiKeyMetadata[] }> =>
          isRecord(value) && value.ok === true
          && Array.isArray(value.keys) && value.keys.every(isApiKeyMetadata),
      );
      if (result.status === "error") return result;
      return { status: "success", data: result.data.keys };
    },

    async create(input: Readonly<{
      label: string;
      scopes?: readonly ApiKeyScope[];
      expiresInDays?: number;
    }>): Promise<ApiKeyServiceResult<Readonly<{
      key: string;
      record: ApiKeyRecord;
      warning: string;
    }>>> {
      const label = input.label.trim();
      if (label.length < 1 || label.length > 100) {
        return { status: "error", code: "invalid_label" };
      }
      const scopes = input.scopes ?? ["api:read"];
      if (scopes.length < 1 || scopes.length > 2
        || scopes.some((scope) => !ALLOWED_SCOPES.has(scope))
        || new Set(scopes).size !== scopes.length) {
        return { status: "error", code: "invalid_scopes" };
      }
      if (input.expiresInDays !== undefined
        && (!Number.isInteger(input.expiresInDays)
          || input.expiresInDays < 1 || input.expiresInDays > 365)) {
        return { status: "error", code: "invalid_expiration" };
      }

      const body: Record<string, unknown> = { action: "create", label, scopes };
      if (input.expiresInDays !== undefined) body.expires_in_days = input.expiresInDays;

      return invoke(body, (value): value is Extract<ApiKeyManagerResponse, { key: string }> =>
        isRecord(value) && value.ok === true
        && typeof value.key === "string"
        && isApiKeyRecord(value.record)
        && typeof value.warning === "string",
      );
    },

    async revoke(id: string): Promise<ApiKeyServiceResult<Readonly<{
      id: string;
      revoked_at: string | null;
    }>>> {
      if (!UUID_PATTERN.test(id)) return { status: "error", code: "invalid_key_id" };
      return invoke(
        { action: "revoke", id },
        (value): value is Extract<ApiKeyManagerResponse, { revoked: unknown }> =>
          isRecord(value) && value.ok === true
          && isRecord(value.revoked)
          && Object.keys(value.revoked).every((key) => key === "id" || key === "revoked_at")
          && typeof value.revoked.id === "string"
          && isNullableString(value.revoked.revoked_at),
      ).then((result) => result.status === "error"
        ? result
        : { status: "success", data: result.data.revoked });
    },
  });
}
