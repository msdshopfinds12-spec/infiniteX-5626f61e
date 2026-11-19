import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeadersForRequest } from "../_shared/cors.ts";
import { readJsonBodyLimited } from "../_shared/worker-security.mjs";

function response(req: Request, status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeadersForRequest(req).headers });
}
function b64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  const cors = corsHeadersForRequest(req);
  if (!cors.allowed) return new Response("origin_not_allowed", { status: 403, headers: cors.headers });
  if (req.method === "OPTIONS") {
    if (!cors.allowed) return new Response("origin_not_allowed", { status: 403, headers: cors.headers });
    return new Response("ok", { headers: cors.headers });
  }
  if (req.method !== "POST") return response(req, 405, { ok: false, error: "method_not_allowed" });

  const bearer = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return response(req, 401, { ok: false, error: "authentication_required" });

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return response(req, 500, { ok: false, error: "server_configuration_error" });

  const authClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer " + bearer } },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(bearer);
  if (authError || !authData.user) return response(req, 401, { ok: false, error: "invalid_session" });

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const bodyResult = await readJsonBodyLimited(req, 2048);
  if (!bodyResult.ok) {
    const status = bodyResult.reason === "payload_too_large" ? 413 : 400;
    return response(req, status, { ok: false, error: bodyResult.reason });
  }
  const parsed = bodyResult.value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return response(req, 400, { ok: false, error: "invalid_json" });
  }
  const body = parsed as Record<string, unknown>;

  const ownerId = authData.user.id;
  const action = body.action;

  if (action === "list") {
    const { data, error } = await admin.from("platform_api_keys")
      .select("id,label,key_prefix,scopes,expires_at,last_used_at,revoked_at,created_at")
      .eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(100);
    if (error) return response(req, 500, { ok: false, error: "api_key_list_failed" });
    return response(req, 200, { ok: true, keys: data ?? [] });
  }

  if (action === "create") {
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (label.length < 1 || label.length > 100) return response(req, 400, { ok: false, error: "label_length_invalid" });

    const scopes = Array.isArray(body.scopes) ? body.scopes : ["api:read"];
    const allowed = new Set(["api:read", "api:write"]);
    if (!scopes.length || scopes.length > 2 || scopes.some((s) => typeof s !== "string" || !allowed.has(s))) {
      return response(req, 400, { ok: false, error: "invalid_scopes" });
    }

    let expiresAt: string | null = null;
    if (body.expires_in_days !== undefined) {
      const days = body.expires_in_days;
      if (typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > 365) {
        return response(req, 400, { ok: false, error: "expires_in_days_must_be_1_to_365" });
      }
      expiresAt = new Date(Date.now() + days * 86400000).toISOString();
    }

    const random = crypto.getRandomValues(new Uint8Array(32));
    const rawKey = "ashaa_live_" + b64url(random);
    const prefix = rawKey.slice(0, 18);
    const digest = await sha256(rawKey);
    const { data, error } = await admin.from("platform_api_keys").insert({
      owner_id: ownerId, label, key_prefix: prefix, key_hash: digest, scopes, expires_at: expiresAt,
    }).select("id,label,key_prefix,scopes,expires_at,created_at").single();

    if (error) return response(req, 500, { ok: false, error: "api_key_create_failed" });
    // The raw key is returned exactly once. Only its SHA-256 digest is stored.
    return response(req, 201, { ok: true, key: rawKey, record: data, warning: "Copy this key now. It cannot be retrieved again." });
  }

  if (action === "revoke") {
    const id = typeof body.id === "string" ? body.id : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return response(req, 400, { ok: false, error: "invalid_key_id" });
    }
    const { data, error } = await admin.from("platform_api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id).eq("owner_id", ownerId).is("revoked_at", null)
      .select("id,revoked_at").maybeSingle();
    if (error) return response(req, 500, { ok: false, error: "api_key_revoke_failed" });
    if (!data) return response(req, 404, { ok: false, error: "key_not_found_or_already_revoked" });
    return response(req, 200, { ok: true, revoked: data });
  }

  return response(req, 400, { ok: false, error: "unsupported_action" });
});