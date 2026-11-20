import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "../../lib/supabase/database.types.ts";

export type OwnProfile = Pick<
  Tables<"profiles">,
  "display_name" | "avatar_url" | "created_at" | "updated_at"
>;

export type ProfileReadResult =
  | Readonly<{ status: "success"; data: OwnProfile | null }>
  | Readonly<{ status: "error"; code: "query_failed" | "network_unavailable" }>;

export type ProfileReadService = Readonly<{
  getOwnProfile: () => Promise<ProfileReadResult>;
}>;

const PROFILE_COLUMNS = "display_name,avatar_url,created_at,updated_at" as const;

/**
 * Read-only profile lookup. The identity comes from the verified auth session;
 * RLS remains authoritative. Role, email, and all writable fields are excluded.
 */
export function createProfileReadService(
  client: Pick<SupabaseClient<Database>, "from">,
): ProfileReadService {
  return Object.freeze({
    async getOwnProfile() {
      try {
        // PostgreSQL RLS derives the visible profile from auth.uid().
        // No caller-controlled identity is accepted or sent in the query.
        const { data, error } = await client
          .from("profiles")
          .select(PROFILE_COLUMNS)
          .maybeSingle();

        if (error) return { status: "error", code: "query_failed" } as const;
        return { status: "success", data: data as OwnProfile | null } as const;
      } catch {
        return { status: "error", code: "network_unavailable" } as const;
      }
    },
  });
}
