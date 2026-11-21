import { createClient } from "npm:@supabase/supabase-js@2.119.2";
import { createAuthenticatedWorkerHandler } from "../../supabase/functions/simula-workflow-worker/index.ts";
import { createCorsHeaders } from "../../supabase/functions/_shared/cors.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error("Missing Phase 94 environment value: " + name);
  return value;
}

/** Standalone PostgREST has no Supabase Kong /rest/v1 prefix. */
const postgrestFetch: typeof fetch = (input, init) => {
  const source = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
  const target = new URL(source);
  if (target.pathname === "/rest/v1") target.pathname = "/";
  else if (target.pathname.startsWith("/rest/v1/")) target.pathname = target.pathname.slice("/rest/v1".length);
  const timeoutSignal = AbortSignal.timeout(20_000);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  if (input instanceof Request) return fetch(new Request(target, input), { signal });
  return fetch(target, { ...init, signal });
};

const createPostgrestClient = ((
  projectUrl: string,
  apiKey: string,
  options?: Parameters<typeof createClient>[2],
) => createClient(projectUrl, apiKey, {
  ...(options ?? {}),
  global: { ...(options?.global ?? {}), fetch: postgrestFetch },
})) as typeof createClient;

Deno.test({
  name: "Phase 94: accepted workflow enqueue executes through authenticated worker and appears in owner run history",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const url = required("PHASE81_POSTGREST_URL");
    const tokenA = required("PHASE81_USER_JWT");
    const ownerA = required("PHASE81_USER_ID");
    const serviceJwt = required("PHASE81_SERVICE_JWT");
    const workflowA = "81000000-1000-4000-8000-000000000001";
    // Phase 84 integration creates this exact idempotent request before Phase 94 runs.
    const requestA = "84000000-3000-4000-8000-000000000001";
    const anonKey = "phase94-disposable-anon-key";

    const clientA = createPostgrestClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: "Bearer " + tokenA }, fetch: postgrestFetch },
    });
    const admin = createPostgrestClient(url, serviceJwt, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: "Bearer " + serviceJwt }, fetch: postgrestFetch },
    });

    const executeSafeAction = (await import("../../supabase/functions/_shared/workflow-actions.mjs")).executeSafeAction;
    const handler = createAuthenticatedWorkerHandler({
      createClient: createPostgrestClient as never,
      env: {
        get(name: string) {
          if (name === "SUPABASE_URL") return url;
          if (name === "SUPABASE_ANON_KEY") return anonKey;
          if (name === "SUPABASE_SERVICE_ROLE_KEY") return serviceJwt;
          return undefined;
        },
      },
      corsHeadersForRequest: (request) => createCorsHeaders(request.headers.get("origin"), ""),
      executeSafeAction: executeSafeAction as never,
      authenticateBearerRequest: (async ({ request, env, createClient: makeClient }: {
        request: Request;
        env: { get(name: string): string | undefined };
        createClient: typeof createClient;
      }) => {
        const match = request.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i);
        if (!match || match[1] !== tokenA) {
          return { ok: false as const, status: 401, error: "invalid_session" };
        }
        const userClient = makeClient(url, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: "Bearer " + tokenA }, fetch: postgrestFetch },
        });
        return {
          ok: true as const,
          userClient,
          ownerId: ownerA,
          supabaseUrl: url,
          serviceRoleKey: serviceJwt,
        };
      }) as never,
    });

    const server = Deno.serve({ hostname: "127.0.0.1", port: 8083, onListen() {} }, handler);
    try {
      const endpoint = "http://127.0.0.1:8083/functions/v1/simula-workflow-worker";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + tokenA,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ limit: 10 }),
        signal: AbortSignal.timeout(25_000),
      });
      const body = await response.json();
      assert(response.status === 200 && body.ok === true,
        "authenticated worker must accept the queued request: " + JSON.stringify(body));
      assert(body.claimed >= 1 && body.succeeded >= 1 && body.failed === 0,
        "worker must complete the queued batch without failures: " + JSON.stringify(body));
      assert(body.runs.some((run: { id?: string; status?: string }) =>
        run.id === requestA && run.status === "succeeded"),
      "worker response must report the Phase 84 enqueue request as succeeded: " + JSON.stringify(body.runs));

      const { data: persisted, error: persistedError } = await admin
        .from("workflow_runs")
        .select("id,workflow_id,owner_id,status,attempt,output")
        .eq("id", requestA)
        .single();
      assert(!persistedError && persisted, "the exact enqueued run must persist after worker execution");
      assert(persisted.workflow_id === workflowA && persisted.owner_id === ownerA,
        "worker must preserve workflow and tenant ownership");
      assert(persisted.status === "succeeded" && persisted.attempt === 1,
        "worker must persist terminal success at attempt generation one");
      assert(persisted.output?.phase81 === "http-postgrest" && persisted.output?.verified === true,
        "worker must persist expected output from both workflow steps");

      const { data: steps, error: stepsError } = await admin
        .from("workflow_step_runs")
        .select("step_id,status,attempt")
        .eq("run_id", requestA)
        .eq("owner_id", ownerA);
      assert(!stepsError && steps?.length === 2,
        "both workflow step results must be durably persisted");
      assert(steps.every((step) => step.status === "succeeded" && step.attempt === 1),
        "both step results must be successful at the same run generation");

      // Verify the user-facing history read with the owner JWT, not the service role.
      const { data: visibleHistory, error: historyError } = await clientA
        .from("workflow_runs")
        .select("id,status,created_at,finished_at,attempt")
        .eq("id", requestA)
        .eq("workflow_id", workflowA)
        .single();
      assert(!historyError && visibleHistory?.status === "succeeded",
        "the authenticated owner must read the persisted terminal state through RLS");

      const { data: foreignHistory, error: foreignError } = await clientA
        .from("workflow_runs")
        .select("id")
        .eq("id", "84000000-3000-4000-8000-000000000002");
      assert(!foreignError && (foreignHistory ?? []).length === 0,
        "owner A history must not expose owner B's enqueued run");

      console.log("Phase 94: enqueue -> authenticated worker -> PostgreSQL terminal state -> owner RLS history verified");
    } finally {
      await server.shutdown();
    }
  },
});
