import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createAiRuntimeHandler, type AiAuthResult } from "../_shared/ai-runtime.ts";
import { corsHeadersForRequest } from "../_shared/cors.ts";

async function authenticate(request: Request): Promise<AiAuthResult> {
  const bearer = request.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!bearer) return { ok: false, status: 401, code: "authentication_required" };

  const url = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!url || !publishableKey) {
    return { ok: false, status: 500, code: "server_configuration_error" };
  }

  const userClient = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer " + bearer } },
  });
  const { data, error } = await userClient.auth.getUser(bearer);
  if (error || !data?.user?.id) {
    return { ok: false, status: 401, code: "invalid_session" };
  }
  return { ok: true, ownerId: data.user.id };
}

Deno.serve(createAiRuntimeHandler({
  env: { get: (name) => Deno.env.get(name) },
  corsHeadersForRequest,
  authenticate,
  // Intentionally no provider adapter in production. A future provider requires
  // server-side secret, privacy/cost review, and a separately approved quota gate.
  provider: null,
}));
