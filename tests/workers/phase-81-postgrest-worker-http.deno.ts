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

  // Bound database HTTP calls so stalled PostgREST requests cannot consume
  // the entire GitHub Actions job timeout.
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
    const server = Deno.serve({
      hostname: "127.0.0.1",
      port: workerPort,
      onListen() { console.log("Phase 81: local worker HTTP server listening"); },
    }, handler);
    try {
      const endpoint = "http://127.0.0.1:" + workerPort + "/functions/v1/simula-workflow-worker";
      const request = () => fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + userJwt,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ limit: 1 }),
        signal: AbortSignal.timeout(25_000),
      });

      // Launch two independent HTTP requests at the same time. PostgreSQL's
      // atomic claim RPC must assign distinct owner-A queue rows to each worker.
      console.log("Phase 81: dispatching two concurrent authenticated worker requests");
      const responses = await Promise.all([request(), request()]);
      console.log("Phase 81: both worker HTTP responses received", responses.map((response) => response.status));
      const bodies = await Promise.all(responses.map((response) => response.json()));
      assert(responses.every((response) => response.status === 200), "both concurrent worker HTTP requests must return 200");
      assert(bodies.every((body) => body.claimed === 1 && body.succeeded === 1 && body.failed === 0),
        "each concurrent worker must claim and complete exactly one owner-A run: " + JSON.stringify(bodies));
      const claimedIds = bodies.flatMap((body) => body.runs.map((run: { id?: string }) => run.id));
      assert(claimedIds.length === 2 && new Set(claimedIds).size === 2,
        "concurrent workers must receive two distinct run IDs: " + JSON.stringify(claimedIds));
      assert(claimedIds.includes(runId) && claimedIds.includes("81000000-3000-4000-8000-000000000003"),
        "both seeded owner-A runs must be claimed exactly once");

      const admin = createPostgrestClient(url, serviceJwt, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: "Bearer " + serviceJwt }, fetch: postgrestFetch },
      });
      const ownerRunIds = [runId, "81000000-3000-4000-8000-000000000003"];
      const { data: runs, error: runsError } = await admin
        .from("workflow_runs")
        .select("id,owner_id,status,attempt,output")
        .in("id", ownerRunIds);
      assert(!runsError && runs?.length === 2, "both owner-A workflow runs must be readable from PostgreSQL: " + (runsError?.message ?? ""));
      assert(runs.every((run) => run.owner_id === userId && run.status === "succeeded" && run.attempt === 1),
        "both owner-A runs must persist succeeded state at generation 1");
      assert(runs.every((run) => run.output?.phase81 === "http-postgrest" && run.output?.verified === true),
        "both runs must persist the complete two-step output");
      console.log("Phase 81: workflow run persistence verified");

      const { data: steps, error: stepsError } = await admin
        .from("workflow_step_runs")
        .select("run_id,step_id,status,attempt,output")
        .in("run_id", ownerRunIds);
      assert(!stepsError && steps?.length === 4, "four step-run records (two per workflow) must persist");
      assert(steps.every((step) => step.status === "succeeded" && step.attempt === 1),
        "all concurrent step runs must succeed at generation 1");
      console.log("Phase 81: step-run persistence verified");
      for (const ownerRunId of ownerRunIds) {
        assert(steps.filter((step) => step.run_id === ownerRunId).length === 2,
          "each concurrent workflow must persist exactly two step runs");
      }

      const { data: logs, error: logsError } = await admin
        .from("workflow_logs")
        .select("event,run_id")
        .in("run_id", ownerRunIds);
      assert(!logsError && logs?.length === 6, "four step events and two workflow events must persist");
      console.log("Phase 81: workflow log persistence verified");

      const { data: tenantB, error: tenantBError } = await admin
        .from("workflow_runs")
        .select("status,attempt")
        .eq("id", "81000000-3000-4000-8000-000000000002")
        .single();

      assert(!tenantBError && tenantB?.status === "queued" && tenantB.attempt === 0,
        "concurrent owner-A requests must not claim owner-B queue rows");
      console.log("Phase 81: tenant isolation verified");

      // Retire only the two exact disposable queue leftovers after tenant
      // isolation has been proven. Phase 103.3 subsequently exercises the
      // trusted global cron claim and must not consume unrelated fixtures.
      const leftoverIds = [
        "81000000-3000-4000-8000-000000000004",
        "81000000-3000-4000-8000-000000000002",
      ];
      const { data: leftovers, error: leftoversError } = await admin
        .from("workflow_runs")
        .select("id,owner_id,status,attempt,lease_token,lease_until")
        .in("id", leftoverIds);
      assert(!leftoversError && leftovers?.length === 2,
        "Phase 81 disposable leftovers missing; refusing fixture cleanup");
      const expectedOwners = new Map([
        ["81000000-3000-4000-8000-000000000004", userId],
        ["81000000-3000-4000-8000-000000000002", required("PHASE81_USER_B_ID")],
      ]);
      assert(leftovers.every((row) =>
        expectedOwners.get(row.id) === row.owner_id &&
        row.status === "queued" && row.attempt === 0 &&
        row.lease_token === null && row.lease_until === null
      ), "Phase 81 leftovers changed unexpectedly; refusing cleanup");

      const { data: childSteps, error: childStepsError } = await admin
        .from("workflow_step_runs").select("id").in("run_id", leftoverIds);
      assert(!childStepsError && childSteps?.length === 0,
        "Phase 81 leftovers have step records; refusing cleanup");
      const { data: childLogs, error: childLogsError } = await admin
        .from("workflow_logs").select("id").in("run_id", leftoverIds);
      assert(!childLogsError && childLogs?.length === 0,
        "Phase 81 leftovers have log records; refusing cleanup");

      const { data: deletedLeftovers, error: deleteError } = await admin
        .from("workflow_runs").delete().in("id", leftoverIds).select("id");
      assert(!deleteError && deletedLeftovers?.length === 2 &&
        new Set(deletedLeftovers.map((row) => row.id)).size === 2 &&
        leftoverIds.every((id) => deletedLeftovers.some((row) => row.id === id)),
        "exact Phase 81 disposable leftovers could not be safely retired");
      console.log("Phase 81: verified and retired exact disposable queue leftovers");


    } finally {
      console.log("Phase 81: shutting down local worker HTTP server");
      await server.shutdown();
    }
  },
});
