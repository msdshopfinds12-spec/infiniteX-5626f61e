import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeadersForRequest } from "../_shared/cors.ts";
import { assertJsonByteLimit, readJsonBodyLimited } from "../_shared/worker-security.mjs";

type JsonRecord = Record<string, unknown>;
type AuthSuccess = Readonly<{ ok: true; userClient: SupabaseClient<any, "public", any, any, any>; ownerId: string }>;
type AuthFailure = Readonly<{ ok: false; status: number; error: string }>;
type AuthResult = AuthSuccess | AuthFailure;
type Dependencies = Readonly<{
  createClient: typeof createClient;
  env: { get(name: string): string | undefined };
  corsHeadersForRequest: typeof corsHeadersForRequest;
  authenticate?: (args: {
    request: Request;
    env: Dependencies["env"];
    createClient: typeof createClient;
  }) => Promise<AuthResult>;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_BODY_KEYS = new Set(["workflow_id", "request_id", "input"]);

function response(status: number, payload: JsonRecord, corsHeaders: HeadersInit) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...Object.fromEntries(new Headers(corsHeaders).entries()), "Content-Type": "application/json; charset=utf-8" },
  });
}

async function authenticateUser({ request, env, createClient: makeClient }: {
  request: Request;
  env: Dependencies["env"];
  createClient: typeof createClient;
}): Promise<AuthResult> {
  const bearer = request.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!bearer) return { ok: false, status: 401, error: "authentication_required" };

  const url = env.get("SUPABASE_URL");
  const publishableKey = env.get("SUPABASE_ANON_KEY") ?? env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!url || !publishableKey) {
    return { ok: false, status: 500, error: "server_configuration_error" };
  }

  const userClient = makeClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer " + bearer } },
  });
  const { data, error } = await userClient.auth.getUser(bearer);
  if (error || !data?.user?.id) {
    return { ok: false, status: 401, error: "invalid_session" };
  }
  return { ok: true, userClient, ownerId: data.user.id };
}

function mapRpcError(error: { code?: string; message?: string }): { status: number; code: string } {
  switch (error.code) {
    case "28000": return { status: 401, code: "authentication_required" };
    case "42501": return { status: 404, code: "workflow_not_found_or_inactive" };
    case "22023": return { status: 400, code: "invalid_workflow_request" };
    case "22001": return { status: 413, code: "workflow_input_too_large" };
    case "54000": return { status: 429, code: "workflow_queue_limit_reached" };
    case "23505": return { status: 409, code: "request_id_conflict" };
    default: return { status: 500, code: "workflow_enqueue_failed" };
  }
}

export function createWorkflowRunRequestHandler(deps: Dependencies) {
  const authenticate = deps.authenticate ?? authenticateUser;
  return async (req: Request): Promise<Response> => {
    const cors = deps.corsHeadersForRequest(req);
    if (!cors.allowed) return new Response("origin_not_allowed", { status: 403, headers: cors.headers });
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors.headers });
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), {
        status: 405,
        headers: { ...cors.headers, "Content-Type": "application/json; charset=utf-8" },
      });
    }

    const auth = await authenticate({ request: req, env: deps.env, createClient: deps.createClient });
    if (!auth.ok) return response(auth.status, { ok: false, error: auth.error }, cors.headers);

    const bodyResult = await readJsonBodyLimited(req, 20 * 1024);
    if (!bodyResult.ok) {
      const status = bodyResult.reason === "payload_too_large" ? 413 : 400;
      return response(status, { ok: false, error: bodyResult.reason }, cors.headers);
    }
    if (!bodyResult.value || typeof bodyResult.value !== "object" || Array.isArray(bodyResult.value)) {
      return response(400, { ok: false, error: "invalid_json_object" }, cors.headers);
    }

    const body = bodyResult.value as JsonRecord;
    if (Object.keys(body).some((key) => !ALLOWED_BODY_KEYS.has(key))) {
      return response(400, { ok: false, error: "unsupported_request_field" }, cors.headers);
    }
    const workflowId = typeof body.workflow_id === "string" ? body.workflow_id : "";
    const requestId = typeof body.request_id === "string" ? body.request_id : "";
    const input = body.input === undefined ? {} : body.input;
    if (!UUID_PATTERN.test(workflowId) || !UUID_PATTERN.test(requestId)) {
      return response(400, { ok: false, error: "invalid_workflow_or_request_id" }, cors.headers);
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return response(400, { ok: false, error: "workflow_input_must_be_object" }, cors.headers);
    }
    try {
      assertJsonByteLimit(input, 16 * 1024);
    } catch {
      return response(413, { ok: false, error: "workflow_input_too_large" }, cors.headers);
    }

    const { data, error } = await auth.userClient.rpc("simula_enqueue_workflow_run", {
      p_workflow_id: workflowId,
      p_request_id: requestId,
      p_input: input,
    });
    if (error) {
      const mapped = mapRpcError(error);
      if (mapped.status === 500) console.error("workflow_enqueue_rpc_failed", error.code ?? "unknown");
      return response(mapped.status, { ok: false, error: mapped.code }, cors.headers);
    }

    const run = data?.[0];
    if (!run || !UUID_PATTERN.test(run.id) || typeof run.status !== "string"
      || typeof run.created_at !== "string" || typeof run.replayed !== "boolean") {
      return response(502, { ok: false, error: "invalid_enqueue_response" }, cors.headers);
    }
    return response(run.replayed ? 200 : 201, {
      ok: true,
      run: {
        id: run.id,
        status: run.status,
        created_at: run.created_at,
        replayed: run.replayed,
      },
    }, cors.headers);
  };
}

if (import.meta.main) {
  Deno.serve(createWorkflowRunRequestHandler({
    createClient,
    env: { get: (name) => Deno.env.get(name) },
    corsHeadersForRequest,
  }));
}
