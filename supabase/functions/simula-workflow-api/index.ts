import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeadersForRequest } from "../_shared/cors.ts";
import { readJsonBodyLimited } from "../_shared/worker-security.mjs";
import {
  validateEnqueueWorkflowRequest,
  validateIdempotencyKey,
  WORKFLOW_API_MAX_BODY_BYTES,
} from "./workflow-api-contract.mjs";

type JsonRecord = Record<string, unknown>;

function reply(req: Request, status: number, body: JsonRecord) {
  const headers = corsHeadersForRequest(req).headers;
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

Deno.serve(async (req: Request) => {
  const cors = corsHeadersForRequest(req);
  if (!cors.allowed) return new Response("origin_not_allowed", { status: 403, headers: cors.headers });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors.headers });
  if (req.method !== "POST") return reply(req, 405, { ok: false, error: "method_not_allowed" });

  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  if (path !== "/runs" && !path.endsWith("/simula-workflow-api/runs")) {
    return reply(req, 404, { ok: false, error: "route_not_found" });
  }

  const authorization = req.headers.get("Authorization") ?? "";
  const tokenMatch = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!tokenMatch) return reply(req, 401, { ok: false, error: "invalid_session" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseUrl || !publishableKey) {
    console.error("workflow_api_environment_incomplete");
    return reply(req, 500, { ok: false, error: "internal_error" });
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer " + tokenMatch[1] } },
  });
  const { data, error } = await userClient.auth.getUser(tokenMatch[1]);
  if (error || !data.user?.id) return reply(req, 401, { ok: false, error: "invalid_session" });

  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return reply(req, 415, { ok: false, error: "unsupported_media_type" });
  }

  const idempotencyKey = req.headers.get("Idempotency-Key");
  if (!validateIdempotencyKey(idempotencyKey)) {
    return reply(req, 400, { ok: false, error: "invalid_idempotency_key" });
  }

  const bodyResult = await readJsonBodyLimited(req, WORKFLOW_API_MAX_BODY_BYTES);
  if (!bodyResult.ok) {
    const status = bodyResult.reason === "payload_too_large" ? 413 : 400;
    return reply(req, status, { ok: false, error: bodyResult.reason });
  }

  const validation = validateEnqueueWorkflowRequest(bodyResult.value);
  if (!validation.ok) return reply(req, 400, { ok: false, error: validation.code });

  // Deliberately fail closed until the atomic owner-scoped enqueue RPC and
  // database-enforced idempotency constraint have been reviewed and implemented.
  // No service-role client or direct table insert is permitted in this slice.
  return reply(req, 501, {
    ok: false,
    error: "workflow_enqueue_not_enabled",
    phase: "52.1-52.2",
    message: "Trusted authentication and request validation are ready; atomic persistence is not yet implemented.",
  });
});
