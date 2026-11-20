import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";
import {
  readPublicSupabaseConfig,
  type PublicEnvironment,
  type PublicSupabaseConfigResult,
} from "./public-config.ts";

export type BrowserSupabaseClientResult =
  | { status: "ready"; client: SupabaseClient<Database> }
  | Exclude<PublicSupabaseConfigResult, { status: "ready" }>;

/**
 * Creates a typed browser client only after public configuration validation.
 * Missing or invalid configuration is returned so the app can remain in
 * DEMO MODE without throwing during module initialization.
 */
export function createBrowserSupabaseClient(
  environment: PublicEnvironment,
): BrowserSupabaseClientResult {
  const configResult = readPublicSupabaseConfig(environment);
  if (configResult.status !== "ready") return configResult;

  const client = createClient<Database>(
    configResult.config.url,
    configResult.config.publishableKey,
    {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
        persistSession: true,
      },
    },
  );

  return { status: "ready", client };
}
