/**
 * Browser-safe Supabase configuration.
 *
 * This module validates public Vite environment variables only. It does not
 * create a Supabase client or authenticate users; install the official SDK
 * and complete the backend contract review before wiring live services.
 */
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
  const urlValue = rawUrl?.trim() ?? "";
  const key = rawKey?.trim() ?? "";

  if (!urlValue && !key) {
    return { enabled: false, reason: "missing-public-config" };
  }

  if (!urlValue || !key) {
    throw new Error(
      "Incomplete Supabase browser configuration: set both VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  if (/^(sb_secret_|service_role)/i.test(key) || /service[_-]?role/i.test(key)) {
    throw new Error(
      "A server-only Supabase credential was provided to the browser. Use a publishable/anon key; never expose service_role or sb_secret keys.",
    );
  }

  const isPublishableKey = key.startsWith("sb_publishable_");
  const isLegacyAnonJwt = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key);

  if (!isPublishableKey && !isLegacyAnonJwt) {
    throw new Error(
      "VITE_SUPABASE_PUBLISHABLE_KEY must be a Supabase publishable key or legacy anon JWT.",
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlValue);
  } catch {
    throw new Error("VITE_SUPABASE_URL must be a valid absolute URL.");
  }

  const isLocalHttp =
    parsedUrl.protocol === "http:" &&
    (parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1");

  if (parsedUrl.protocol !== "https:" && !isLocalHttp) {
    throw new Error("Supabase URL must use HTTPS (HTTP is allowed only for localhost).");
  }

  if (
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.search ||
    parsedUrl.hash ||
    parsedUrl.pathname !== "/"
  ) {
    throw new Error("Supabase URL must be an origin only, without credentials, path, query, or hash.");
  }

  return {
    enabled: true,
    url: parsedUrl.origin,
    publishableKey: key,
  };
}

/** Reads Vite's public variables. Missing values intentionally keep demo mode safe. */
export function getSupabaseBrowserConfig(): SupabaseBrowserConfigState {
  return parseSupabaseBrowserConfig(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
}
