import type { Database } from "../../lib/supabase/database.types";

/**
 * Browser-safe API-key metadata contract.
 *
 * Never add key_hash to this projection. Hash verification belongs in a
 * trusted server-side path; RLS row ownership does not hide individual columns.
 */
export const API_KEY_METADATA_COLUMNS = [
  "id",
  "label",
  "key_prefix",
  "scopes",
  "expires_at",
  "last_used_at",
  "revoked_at",
  "created_at",
] as const satisfies readonly (keyof Database["public"]["Tables"]["platform_api_keys"]["Row"])[];

export type ApiKeyMetadata = Pick<
  Database["public"]["Tables"]["platform_api_keys"]["Row"],
  (typeof API_KEY_METADATA_COLUMNS)[number]
>;
