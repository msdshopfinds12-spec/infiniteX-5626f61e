/** Injectable authentication boundaries shared by the HTTP worker adapters. */
export async function authenticateBearerRequest({ request, env, createClient }) {
  const authorization = (request.headers.get("Authorization") ?? "").trim();
  const tokenMatch = authorization.match(/^Bearer\s+(\S+)$/i);
  if (!tokenMatch) return { ok: false, status: 401, error: "missing_bearer_token" };
  const token = tokenMatch[1];
  const supabaseUrl = env.get("SUPABASE_URL");
  const publishableKey = env.get("SUPABASE_ANON_KEY") ?? env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return { ok: false, status: 500, error: "worker_environment_incomplete" };
  }
  const userClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer " + token } },
  });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data?.user?.id) return { ok: false, status: 401, error: "invalid_session" };
  return { ok: true, userClient, ownerId: data.user.id, supabaseUrl, serviceRoleKey };
}

export async function authenticateCronRequest({ request, env, createClient }) {
  const secret = request.headers.get("x-simula-worker-secret");
  if (!secret || secret.length < 32) return { ok: false, status: 401, error: "unauthorized" };
  const supabaseUrl = env.get("SUPABASE_URL");
  const serviceRoleKey = env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return { ok: false, status: 500, error: "worker_environment_incomplete" };
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.rpc("simula_verify_worker_secret", { p_secret: secret });
  if (error || data !== true) return { ok: false, status: 401, error: "unauthorized" };
  return { ok: true, admin, supabaseUrl, serviceRoleKey };
}
