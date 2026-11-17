export type CorsResult = { headers: Headers; allowed: boolean };

/** Exact-origin allowlist. Empty configuration denies browser-origin requests. */
export function corsHeadersForRequest(req: Request): CorsResult {
  const origin = req.headers.get("origin");
  const configured = Deno.env.get("INFINITEX_ALLOWED_ORIGINS") ?? "";
  const allowedOrigins = new Set(configured.split(",").map((v) => v.trim()).filter(Boolean));
  const allowed = !origin || allowedOrigins.has(origin);
  const headers = new Headers({
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  });
  if (origin && allowedOrigins.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return { headers, allowed };
}
