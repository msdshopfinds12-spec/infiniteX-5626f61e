import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeadersForRequest } from "../_shared/cors.ts";
import { readJsonBodyLimited } from "../_shared/worker-security.mjs";
import {
  parseWorkflowApiRoute,
  validateEnqueueWorkflowRequest,
  validateIdempotencyKey,
  parseBearerToken,
  toWorkflowRunStatusDto,
  WORKFLOW_API_MAX_BODY_BYTES,
} from "./workflow-api-contract.mjs";

type JsonRecord = Record<string, unknown>;

function reply(req: Request, status: number, body: JsonRecord) {
  const headers = corsHeadersForRequest(req).headers;
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req: Request) => {
  const cors = corsHeadersForRequest(req);
  if (!cors.allowed) return new Response("origin_not_allowed", { status: 403, headers: cors.headers });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors.headers });

  const route = parseWorkflowApiRoute(new URL(req.url).pathname);
  if (!route) return reply(req, 404, { ok: false, error: "route_not_found" });
  if (route.resource === "runs" && req.method !== "POST") return reply(req, 405, { ok: false, error: "method_not_allowed" });
  if (route.resource === "run" && req.method !== "GET") return reply(req, 405, { ok: false, error: "method_not_allowed" });
  if (route.resource === "cancel" && req.method !== "POST") return reply(req, 405, { ok: false, error: "method_not_allowed" });

  const accessToken = parseBearerToken(req.headers.get("Authorization"));
  if (!accessToken) return reply(req, 401, { ok: false, error: "invalid_session" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseUrl || !publishableKey) {
    console.error("workflow_api_environment_incomplete");
    return reply(req, 500, { ok: false, error: "internal_error" });
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer " + accessToken } },
  });
  const { data, error } = await userClient.auth.getUser(accessToken);
  if (error || !data.user?.id) return reply(req, 401, { ok: false, error: "invalid_session" });

  if (route.resource === "run") {
    // User-scoped client + RLS owner policy prevents cross-user status disclosure.
    // Never return raw output, input, owner IDs, or internal error fields to the browser.
    const { data: run, error: readError } = await userClient
      .from("workflow_runs")
      .select("id,workflow_id,status,attempt,created_at,started_at,finished_at")
      .eq("id", route.runId)
      .maybeSingle();
    if (readError) {
      console.error("workflow_run_status_read_failed");
      return reply(req, 500, { ok: false, error: "internal_error" });
    }
    if (!run) return reply(req, 404, { ok: false, error: "run_not_found" });
    const safeRun = toWorkflowRunStatusDto(run);
    if (!safeRun) {
      console.error("workflow_run_status_projection_invalid");
      return reply(req, 500, { ok: false, error: "internal_error" });
    }
    return reply(req, 200, { ok: true, run: safeRun });
  }

  if (route.resource === "cancel") {
    // Service-role access is limited to a JWT-verified, owner-scoped, queued-only transition.
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceRoleKey) {
      console.error("workflow_api_cancel_environment_incomplete");
      return reply(req, 503, { ok: false, error: "cancel_temporarily_unavailable" });
    }
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: cancelled, error: cancelError } = await admin
      .from("workflow_runs")
      .update({
        status: "cancelled",
        error_message: null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", route.runId)
      .eq("owner_id", data.user.id)
      .eq("status", "queued")
      .select("id,status,finished_at")
      .maybeSingle();
    if (cancelError) {
      console.error("workflow_run_cancel_failed");
      return reply(req, 500, { ok: false, error: "internal_error" });
    }
    if (cancelled) return reply(req, 200, { ok: true, run: cancelled });

    const { data: current, error: currentError } = await admin
      .from("workflow_runs")
      .select("id,status")
      .eq("id", route.runId)
      .eq("owner_id", data.user.id)
      .maybeSingle();
    if (currentError) return reply(req, 500, { ok: false, error: "internal_error" });
    if (!current) return reply(req, 404, { ok: false, error: "run_not_found" });
    return reply(req, 409, {
      ok: false,
      error: "run_not_cancellable",
      status: current.status,
      message: "Only queued runs can be cancelled; a running action is not force-stopped.",
    });
  }

  const mediaType = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
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

  // Fail closed until atomic owner-scoped persistence and database-enforced
  // idempotency are installed and verified in a disposable test database.
  return reply(req, 501, {
    ok: false,
    error: "workflow_enqueue_not_enabled",
    phase: "52.1-52.2",
    message: "Authentication, validation, owner-scoped status reads and queued-only cancellation are ready; enqueue persistence is not enabled.",
  });
});
