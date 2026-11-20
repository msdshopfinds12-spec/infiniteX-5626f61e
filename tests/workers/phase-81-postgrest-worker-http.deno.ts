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
    let releaseBlockedAction!: () => void;
    let notifyBlockedActionStarted!: () => void;
    const blockedActionStarted = new Promise<void>((resolve) => { notifyBlockedActionStarted = resolve; });
    const blockedActionGate = new Promise<void>((resolve) => { releaseBlockedAction = resolve; });

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
      executeSafeAction: (async (actionType: string, input: unknown, config: Record<string, unknown>) => {
        const payload = input && typeof input === "object" ? input as Record<string, unknown> : {};
        if (payload.seed === "phase81-inflight-fencing") {
          notifyBlockedActionStarted();
          await blockedActionGate;
        }
        return executeSafeAction(actionType, input, config);
      }) as never,
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
      const endpoint = "http://127.0.0.1:" + workerPort + "/functions/v1/simula-workflow-worker";
      const request = () => fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + userJwt,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ limit: 1 }),
      });

      // Launch two independent HTTP requests at the same time. PostgreSQL's
      // atomic claim RPC must assign distinct owner-A queue rows to each worker.
      const responses = await Promise.all([request(), request()]);
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

      const { data: steps, error: stepsError } = await admin
        .from("workflow_step_runs")
        .select("run_id,step_id,status,attempt,output")
        .in("run_id", ownerRunIds);
      assert(!stepsError && steps?.length === 4, "four step-run records (two per workflow) must persist");
      assert(steps.every((step) => step.status === "succeeded" && step.attempt === 1),
        "all concurrent step runs must succeed at generation 1");
      for (const ownerRunId of ownerRunIds) {
        assert(steps.filter((step) => step.run_id === ownerRunId).length === 2,
          "each concurrent workflow must persist exactly two step runs");
      }

      const { data: logs, error: logsError } = await admin
        .from("workflow_logs")
        .select("event,run_id")
        .in("run_id", ownerRunIds);
      assert(!logsError && logs?.length === 6, "four step events and two workflow events must persist");

      const { data: tenantB, error: tenantBError } = await admin
        .from("workflow_runs")
        .select("status,attempt")
        .eq("id", "81000000-3000-4000-8000-000000000002")
        .single();

      assert(!tenantBError && tenantB?.status === "queued" && tenantB.attempt === 0,
        "concurrent owner-A requests must not claim owner-B queue rows");

      // Exercise a real database lease takeover while the old HTTP worker is
      // blocked inside its action. The stale worker must fail its generation CAS.
      const staleRunId = "81000000-3000-4000-8000-000000000004";
      const staleRequestPromise = fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + userJwt,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ limit: 1 }),
      });
      await Promise.race([
        blockedActionStarted,
        new Promise((_, reject) => setTimeout(() => reject(new Error("phase81_inflight_action_gate_timeout")), 10000)),
      ]);

      const { data: claimedRun, error: claimReadError } = await admin
        .from("workflow_runs")
        .select("id,status,attempt")
        .eq("id", staleRunId)
        .single();
      assert(!claimReadError && claimedRun?.status === "running" && claimedRun.attempt === 1,
        "stale-run fixture must be claimed at generation 1 before takeover");

      const { data: newerRun, error: newerRunError } = await admin
        .from("workflow_runs")
        .update({ status: "running", attempt: 2, started_at: new Date().toISOString() })
        .eq("id", staleRunId)
        .eq("attempt", 1)
        .select("id")
        .maybeSingle();
      assert(!newerRunError && newerRun?.id === staleRunId, "test must promote run to generation 2");

      const { data: newerStep, error: newerStepError } = await admin
        .from("workflow_step_runs")
        .update({ status: "running", attempt: 2, started_at: new Date().toISOString(), finished_at: null })
        .eq("run_id", staleRunId)
        .eq("step_id", "81000000-2000-4000-8000-000000000001")
        .eq("attempt", 1)
        .select("id")
        .maybeSingle();
      assert(!newerStepError && newerStep?.id, "test must promote active step to generation 2");

      releaseBlockedAction();
      const staleResponse = await staleRequestPromise;
      const staleBody = await staleResponse.json();
      assert(staleResponse.status === 200, "superseded worker batch should return a safe summary");
      assert(staleBody.superseded === 1 && staleBody.succeeded === 0,
        "generation-1 worker must be reported as superseded: " + JSON.stringify(staleBody));

      const { data: finalRun, error: finalRunError } = await admin
        .from("workflow_runs")
        .select("status,attempt")
        .eq("id", staleRunId)
        .single();
      assert(!finalRunError && finalRun?.status === "running" && finalRun.attempt === 2,
        "stale worker must not overwrite newer run generation");

      const { data: finalStep, error: finalStepError } = await admin
        .from("workflow_step_runs")
        .select("status,attempt")
        .eq("run_id", staleRunId)
        .eq("step_id", "81000000-2000-4000-8000-000000000001")
        .single();
      assert(!finalStepError && finalStep?.status === "running" && finalStep.attempt === 2,
        "stale worker must not overwrite newer step generation");

      const { data: staleLogs, error: staleLogsError } = await admin
        .from("workflow_logs")
        .select("id")
        .eq("run_id", staleRunId);
      assert(!staleLogsError && staleLogs?.length === 0,
        "stale worker must not write success logs after losing its lease");

      const { data: laterSteps, error: laterStepsError } = await admin
        .from("workflow_step_runs")
        .select("id")
        .eq("run_id", staleRunId)
        .eq("step_id", "81000000-2000-4000-8000-000000000002");

      assert(!laterStepsError && laterSteps?.length === 0,
        "stale worker must stop before executing later workflow steps");

      // Phase 87.1: transactional step completion + durable outbox intent.
      const outboxRunId = "81000000-3000-4000-8000-000000000005";
      const { error: outboxRunInsertError } = await admin.from("workflow_runs").insert({
        id: outboxRunId,
        workflow_id: "81000000-1000-4000-8000-000000000001",
        owner_id: userId,
        status: "running",
        input: { seed: "phase87-outbox" },
        attempt: 1,
      });
      assert(!outboxRunInsertError, "disposable outbox run must be seeded: " + (outboxRunInsertError?.message ?? ""));
      const { error: outboxStepInsertError } = await admin.from("workflow_step_runs").insert({
        run_id: outboxRunId,
        step_id: "81000000-2000-4000-8000-000000000001",
        owner_id: userId,
        status: "running",
        input: { seed: "phase87-outbox" },
        attempt: 1,
      });
      assert(!outboxStepInsertError, "disposable outbox step must be seeded: " + (outboxStepInsertError?.message ?? ""));

      const completionArgs = {
        p_owner_id: userId,
        p_run_id: outboxRunId,
        p_step_id: "81000000-2000-4000-8000-000000000001",
        p_attempt: 1,
        p_output: { transformed: true },
        p_event_type: "notification.requested",
        p_idempotency_key: "phase87-disposable-notification-0001",
        p_payload: { recipient_ref: "synthetic-user-a", template: "test-only" },
      };
      console.log("phase87_outbox: seeded synthetic run and step");
      const { data: firstCompletion, error: firstCompletionError } = await admin.rpc(
        "simula_complete_step_with_outbox",
        completionArgs,
      );
      assert(!firstCompletionError && firstCompletion?.length === 1 && firstCompletion[0].replayed === false,
        "first completion must atomically finish the step and create one outbox event: " + (firstCompletionError?.message ?? ""));
      const outboxId = firstCompletion[0].outbox_id;
      assert(typeof outboxId === "string", "first completion must return durable outbox event ID");

      const { data: replayCompletion, error: replayCompletionError } = await admin.rpc(
        "simula_complete_step_with_outbox",
        completionArgs,
      );
      assert(!replayCompletionError && replayCompletion?.[0]?.replayed === true
        && replayCompletion[0].outbox_id === outboxId,
        "same idempotency key and payload must replay the original outbox event");

      const { error: conflictError } = await admin.rpc("simula_complete_step_with_outbox", {
        ...completionArgs,
        p_payload: { recipient_ref: "different-recipient", template: "test-only" },
      });
      assert(Boolean(conflictError), "same idempotency key with different payload must be rejected");

      console.log("phase87_outbox: atomic completion and idempotent replay passed");
      const claimArgs = { p_limit: 5 };
      const [claimA, claimB] = await Promise.all([
        admin.rpc("simula_claim_workflow_outbox", claimArgs),
        admin.rpc("simula_claim_workflow_outbox", claimArgs),
      ]);
      assert(!claimA.error && !claimB.error, "parallel outbox claim RPCs must succeed");
      const claimedOutbox = [...(claimA.data ?? []), ...(claimB.data ?? [])]
        .filter((event) => event.id === outboxId);
      assert(claimedOutbox.length === 1 && claimedOutbox[0].attempts === 1,
        "parallel claimers must lease the same outbox event to exactly one worker");
      const firstLease = claimedOutbox[0];

      console.log("phase87_outbox: concurrent claim passed");
      const { data: failedFinish, error: failedFinishError } = await admin.rpc(
        "simula_finish_workflow_outbox",
        { p_id: outboxId, p_lock_token: firstLease.lock_token, p_succeeded: false, p_error: "synthetic_transient_failure" },
      );
      assert(!failedFinishError && failedFinish?.[0]?.status === "pending",
        "transient delivery failure must return event to pending with backoff");

      await new Promise((resolve) => setTimeout(resolve, 5500));
      const { data: secondClaims, error: secondClaimError } = await admin.rpc(
        "simula_claim_workflow_outbox",
        { p_limit: 5 },
      );
      assert(!secondClaimError, "outbox retry claim must succeed");
      const secondLease = (secondClaims ?? []).find((event: { id: string; attempts: number; lock_token: string }) => event.id === outboxId);
      assert(secondLease && secondLease.attempts === 2 && secondLease.lock_token !== firstLease.lock_token,
        "retry must issue a new generation token and increment attempt count");

      const { error: staleLeaseError } = await admin.rpc("simula_finish_workflow_outbox", {
        p_id: outboxId,
        p_lock_token: firstLease.lock_token,
        p_succeeded: false,
        p_error: "stale_worker_must_not_commit",
      });
      assert(Boolean(staleLeaseError), "stale outbox lease token must not complete a newer delivery attempt");

      console.log("phase87_outbox: retry lease and stale token fencing passed");
      const { data: successfulFinish, error: successfulFinishError } = await admin.rpc(
        "simula_finish_workflow_outbox",
        { p_id: outboxId, p_lock_token: secondLease.lock_token, p_succeeded: true, p_error: null },
      );
      assert(!successfulFinishError && successfulFinish?.[0]?.status === "succeeded",
        "current outbox lease must be able to complete delivery");

      const { data: finalReplay, error: finalReplayError } = await admin.rpc(
        "simula_complete_step_with_outbox",
        completionArgs,
      );
      assert(!finalReplayError && finalReplay?.[0]?.replayed === true
        && finalReplay[0].outbox_id === outboxId,
        "completion replay after delivery must return the same outbox event");

    } finally {
      await server.shutdown();
    }
  },
});
