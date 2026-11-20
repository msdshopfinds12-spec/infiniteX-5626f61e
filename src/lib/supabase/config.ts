/**
 * Compatibility adapter for browser-safe Supabase configuration.
 *
 * Validation is centralized in public-config.ts so callers cannot drift into
 * accepting different credential formats.
 */
import { readPublicSupabaseConfig } from "./public-config.ts";

export type SupabaseBrowserConfig = {
  enabled: true;
  url: string;
  publishableKey: string;
};

export type SupabaseBrowserConfigState =
  | SupabaseBrowserConfig
  | { enabled: false; reason: "missing-public-config" };

export function parseSupabaseBrowserConfig(
  rawUrl: string | undefined,
  rawKey: string | undefined,
): SupabaseBrowserConfigState {
  const result = readPublicSupabaseConfig({
    VITE_SUPABASE_URL: rawUrl,
    VITE_SUPABASE_PUBLISHABLE_KEY: rawKey,
  });

  if (result.status === "missing") {
    if (result.missing.length === 2) {
      return { enabled: false, reason: "missing-public-config" };
    }
    throw new Error(
      "Incomplete Supabase browser configuration: set both VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  if (result.status === "invalid") {
    const messages = {
      "invalid-url": "VITE_SUPABASE_URL must be a valid HTTPS origin without credentials, path, query, or hash.",
      "insecure-url": "Supabase URL must use HTTPS (HTTP is allowed only for localhost).",
      "invalid-key": "Invalid or server-only Supabase credential. Use a publishable key or a legacy anon JWT; never expose service_role or sb_secret keys.",
    } as const;
    throw new Error(messages[result.reason]);
  }

  return {
    enabled: true,
    url: result.config.url,
    publishableKey: result.config.publishableKey,
  };
}

/** Reads Vite's public variables. Missing values intentionally keep demo mode safe. */
export function getSupabaseBrowserConfig(): SupabaseBrowserConfigState {
  return parseSupabaseBrowserConfig(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
}
