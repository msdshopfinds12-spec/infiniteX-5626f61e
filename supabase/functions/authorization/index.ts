import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeadersForRequest } from "../_shared/cors.ts";
import { readJsonBodyLimited } from "../_shared/worker-security.mjs";
import { parseBearerToken } from "../_shared/bearer-token.mjs";
import {
  createPolicyUnavailablePayload,
  isEmptyAuthorizationRequest,
} from "../_shared/authorization-policy.mjs";

function reply(headers: Headers, status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers,
  });
}

Deno.serve(async (req: Request) => {
  const cors = corsHeadersForRequest(req);
  if (!cors.allowed) {
    return reply(cors.headers, 403, { ok: false, error: "ORIGIN_NOT_ALLOWED" });
  }
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors.headers });
  if (req.method !== "POST") {
    return reply(cors.headers, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  const token = parseBearerToken(req.headers.get("Authorization"));
  if (!token) {
    return reply(cors.headers, 401, { ok: false, error: "UNAUTHENTICATED" });
  }

  const contentType = req.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return reply(cors.headers, 415, { ok: false, error: "UNSUPPORTED_MEDIA_TYPE" });
  }

  const bodyResult = await readJsonBodyLimited(req, 1024);
  if (!bodyResult.ok) {
    const status = bodyResult.reason === "payload_too_large" ? 413 : 400;
    return reply(cors.headers, status, { ok: false, error: "INVALID_REQUEST" });
  }
  if (!isEmptyAuthorizationRequest(bodyResult.value)) {
    return reply(cors.headers, 400, { ok: false, error: "INVALID_REQUEST" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") ??
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseUrl || !publishableKey) {
    console.error("authorization_environment_incomplete");
    return reply(cors.headers, 500, { ok: false, error: "INTERNAL_ERROR" });
  }

  try {
    const authClient = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await authClient.auth.getUser(token);
    if (error || !data.user) {
      return reply(cors.headers, 401, { ok: false, error: "UNAUTHENTICATED" });
    }

    // Identity is verified, but no authoritative role/membership source has
    // been approved. Do not infer permissions from user_metadata or JWT claims.
    // Returning 503 keeps the UI in a non-authorized state until policy is real.
    return reply(cors.headers, 503, createPolicyUnavailablePayload());
  } catch {
    console.error("authorization_request_failed");
    return reply(cors.headers, 500, { ok: false, error: "INTERNAL_ERROR" });
  }
});
