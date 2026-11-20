export type CorsResult = { headers: Headers; allowed: boolean };

/** Pure exact-origin policy; intentionally does not normalize or wildcard origins. */
export function createCorsHeaders(origin: string | null, configured: string): CorsResult {
  const allowedOrigins = new Set(configured.split(",").map((v) => v.trim()).filter(Boolean));
  const allowed = !origin || allowedOrigins.has(origin);
  const headers = new Headers({
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, idempotency-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  });
  if (origin && allowedOrigins.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return { headers, allowed };
}

/** Edge-runtime adapter. Browser origins are denied when the allowlist is empty. */
export function corsHeadersForRequest(req: Request): CorsResult {
  return createCorsHeaders(
    req.headers.get("origin"),
    Deno.env.get("INFINITEX_ALLOWED_ORIGINS") ?? "",
  );
}
