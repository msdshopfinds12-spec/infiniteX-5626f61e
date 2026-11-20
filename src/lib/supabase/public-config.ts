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

function isLegacyAnonJwt(key: string): boolean {
  const segments = key.split(".");
  if (segments.length !== 3 || segments.some((segment) => segment.length === 0)) {
    return false;
  }

  try {
    const payload = segments[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "="));
    const claims: unknown = JSON.parse(decoded);
    return (
      typeof claims === "object" &&
      claims !== null &&
      "role" in claims &&
      claims.role === "anon"
    );
  } catch {
    return false;
  }
}

function isBrowserSafeKey(key: string): boolean {
  const publishablePrefix = "sb_publishable_";
  if (key.startsWith(publishablePrefix)) {
    return key.length > publishablePrefix.length;
  }

  // Legacy anon keys are JWTs whose role claim must be anon. A JWT-shaped
  // string alone is not enough: service_role and arbitrary JWTs are rejected.
  return isLegacyAnonJwt(key);
}

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

  if (!isBrowserSafeKey(publishableKey!)) {
    return { status: "invalid", reason: "invalid-key" };
  }

  return {
    status: "ready",
    config: {
      url: parsedUrl.origin,
      publishableKey: publishableKey!,
    },
  };
}
