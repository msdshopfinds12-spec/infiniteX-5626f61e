export type PublicSupabaseConfig = {
  url: string;
  publishableKey: string;
};

export type PublicSupabaseConfigResult =
  | { status: "ready"; config: PublicSupabaseConfig }
  | { status: "missing"; missing: ("VITE_SUPABASE_URL" | "VITE_SUPABASE_PUBLISHABLE_KEY")[] }
  | { status: "invalid"; reason: "invalid-url" | "insecure-url" | "invalid-key" };

export type PublicEnvironment = Readonly<
  Record<"VITE_SUPABASE_URL" | "VITE_SUPABASE_PUBLISHABLE_KEY", string | undefined>
>;

/**
 * Validates only browser-safe Supabase configuration.
 *
 * Vite exposes VITE_* values in the browser bundle. Never pass service-role,
 * sb_secret_*, worker, webhook, or other privileged secrets to this function.
 */
export function readPublicSupabaseConfig(
  environment: PublicEnvironment,
): PublicSupabaseConfigResult {
  const missing: ("VITE_SUPABASE_URL" | "VITE_SUPABASE_PUBLISHABLE_KEY")[] = [];

  const rawUrl = environment.VITE_SUPABASE_URL?.trim();
  const publishableKey = environment.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!rawUrl) missing.push("VITE_SUPABASE_URL");
  if (!publishableKey) missing.push("VITE_SUPABASE_PUBLISHABLE_KEY");
  if (missing.length > 0) return { status: "missing", missing };

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl!);
  } catch {
    return { status: "invalid", reason: "invalid-url" };
  }

  const isLocalDevelopment =
    parsedUrl.hostname === "localhost" ||
    parsedUrl.hostname === "127.0.0.1" ||
    parsedUrl.hostname === "[::1]";

  if (
    parsedUrl.protocol !== "https:" &&
    !(isLocalDevelopment && parsedUrl.protocol === "http:")
  ) {
    return { status: "invalid", reason: "insecure-url" };
  }

  if (
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.search ||
    parsedUrl.hash ||
    (parsedUrl.pathname !== "/" && parsedUrl.pathname !== "")
  ) {
    return { status: "invalid", reason: "invalid-url" };
  }

  // Supabase publishable keys (sb_publishable_*) and legacy anon JWTs are
  // browser-safe. Reject known privileged key formats before they can ship.
  if (
    !publishableKey ||
    /^sb_secret_/i.test(publishableKey) ||
    /service[_-]?role/i.test(publishableKey) ||
    /secret[_-]?key/i.test(publishableKey)
  ) {
    return { status: "invalid", reason: "invalid-key" };
  }

  return {
    status: "ready",
    config: {
      url: parsedUrl.origin,
      publishableKey,
    },
  };
}
