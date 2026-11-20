import { createClient } from "npm:@supabase/supabase-js@2.119.2";
import { createAuthenticatedWorkerHandler } from "../../supabase/functions/simula-workflow-worker/index.ts";
import { createCorsHeaders } from "../../supabase/functions/_shared/cors.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error("Missing Phase 81 environment value: " + name);
  return value;
}

/** Standalone PostgREST has no Supabase Kong /rest/v1 prefix. */
const postgrestFetch: typeof fetch = (input, init) => {
  const source = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
  const target = new URL(source);
  if (target.pathname === "/rest/v1") target.pathname = "/";
  else if (target.pathname.startsWith("/rest/v1/")) target.pathname = target.pathname.slice("/rest/v1".length);
  if (input instanceof Request) return fetch(new Request(target, input));
  return fetch(target, init);
};

Deno.test({
  name: "Phase 81: real worker HTTP request persists through PostgREST into disposable PostgreSQL",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const url = required("PHASE81_POSTGREST_URL");
    const userJwt = required("PHASE81_USER_JWT");
    const serviceJwt = required("PHASE81_SERVICE_JWT");
    const userId = required("PHASE81_USER_ID");
    const runId = required("PHASE81_RUN_ID");
    const anonKey = "phase81-disposable-anon-key";

    const handler = createAuthenticatedWorkerHandler({
      createClient: createClient as never,
      env: {
        get(name: string) {
          if (name === "SUPABASE_URL") return url;
          if (name === "SUPABASE_ANON_KEY") return anonKey;
          if (name === "SUPABASE_SERVICE_ROLE_KEY") return serviceJwt;
          return undefined;
        },
      },
      corsHeadersForRequest: (request) => createCorsHeaders(request.headers.get("origin"), ""),
      executeSafeAction: (await import("../../supabase/functions/_shared/workflow-actions.mjs")).executeSafeAction,
      // The integration supplies a deterministic synthetic identity boundary. The
      // JWT itself is still verified by PostgREST's signature/role enforcement.
      authenticateBearerRequest: (async ({ request, env, createClient: makeClient }: { request: Request; env: { get(name: string): string | undefined }; createClient: typeof createClient }) => {
        const match = request.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i);
        if (!match || match[1] !== userJwt) {
          return { ok: false as const, status: 401, error: "invalid_session" };
        }
        const supabaseUrl = env.get("SUPABASE_URL")!;
        const publishableKey = env.get("SUPABASE_ANON_KEY")!;
        const serviceRoleKey = env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const userClient = makeClient(supabaseUrl, publishableKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: "Bearer " + userJwt }, fetch: postgrestFetch },
        });
        return { ok: true as const, userClient, ownerId: userId, supabaseUrl, serviceRoleKey };
      }) as never,
    });

    const workerPort = 8081;
    const server = Deno.serve({ hostname: "127.0.0.1", port: workerPort, onListen() {} }, handler);
    try {
      const response = await fetch("http://127.0.0.1:" + workerPort + "/functions/v1/simula-workflow-worker", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + userJwt,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ limit: 1 }),
      });
      const body = await response.json();
      assert(response.status === 200, "worker HTTP endpoint must return 200; got " + response.status);
      assert(body.claimed === 1 && body.succeeded === 1 && body.failed === 0, "worker must claim and execute exactly one owner-A workflow");

      const admin = createClient(url, serviceJwt, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: "Bearer " + serviceJwt }, fetch: postgrestFetch },
      });
      const { data: run, error: runError } = await admin
        .from("workflow_runs")
        .select("id,owner_id,status,attempt,output")
        .eq("id", runId)
        .single();
      assert(!runError && run, "workflow run must be readable from PostgreSQL: " + (runError?.message ?? ""));
      assert(run.owner_id === userId && run.status === "succeeded" && run.attempt === 1, "workflow run must persist succeeded state and generation 1");
      assert(run.output?.phase81 === "http-postgrest" && run.output?.verified === true, "final output must contain both executed step results");

      const { data: steps, error: stepsError } = await admin
        .from("workflow_step_runs")
        .select("run_id,step_id,status,attempt,output")
        .eq("run_id", runId);
      assert(!stepsError && steps?.length === 2, "both step-run records must persist in PostgreSQL");
      assert(steps.every((step) => step.status === "succeeded" && step.attempt === 1), "both persisted steps must succeed at generation 1");

      const { data: logs, error: logsError } = await admin
        .from("workflow_logs")
        .select("event,run_id")
        .eq("run_id", runId);
      assert(!logsError && logs?.length === 3, "two step events and one workflow event must persist");

      const { data: tenantB, error: tenantBError } = await admin
        .from("workflow_runs")
        .select("status,attempt")
        .eq("id", "81000000-3000-4000-8000-000000000002")
        .single();
      assert(!tenantBError && tenantB?.status === "queued" && tenantB.attempt === 0, "owner A request must not claim owner B queue rows");
    } finally {
      await server.shutdown();
    }
  },
});
