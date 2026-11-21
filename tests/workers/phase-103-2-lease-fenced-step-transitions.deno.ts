import { createClient } from "npm:@supabase/supabase-js@2.119.2";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error("Missing Phase 103.2 environment value: " + name);
  return value;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.test({
  name: "Phase 103.2: lease-fenced step start, failure, completion, outbox replay and expiry",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    if (Deno.env.get("PHASE1032_ALLOW_DISPOSABLE_DB_WRITES") !== "true") {
      throw new Error("PHASE1032_BLOCKED: explicit disposable-database opt-in is required");
    }
    if (required("PHASE87_DATABASE_NAME") !== "infinitex_rehearsal") {
      throw new Error("PHASE1032_BLOCKED: only infinitex_rehearsal is permitted");
    }
    const url = required("PHASE81_POSTGREST_URL");
    const endpoint = new URL(url);
    if (endpoint.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "[::1]", "::1"].includes(endpoint.hostname) ||
      endpoint.port !== "3000") {
      throw new Error("PHASE1032_BLOCKED: writes require loopback PostgREST on port 3000");
    }
    const serviceJwt = required("PHASE81_SERVICE_JWT");

    const localFetch: typeof fetch = (input, init) => {
      const source = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
      const target = new URL(source);
      if (target.pathname === "/rest/v1") target.pathname = "/";
      else if (target.pathname.startsWith("/rest/v1/")) target.pathname = target.pathname.slice("/rest/v1".length);
      const timeout = AbortSignal.timeout(20_000);
      const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
      if (input instanceof Request) return fetch(new Request(target, input), { signal });
      return fetch(target, { ...init, signal });
    };
    const admin = createClient(url, serviceJwt, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: "Bearer " + serviceJwt }, fetch: localFetch },
    });

    const workflowA = crypto.randomUUID();
    const workflowB = crypto.randomUUID();
    const runId = crypto.randomUUID();
    const step1 = crypto.randomUUID();
    const step2 = crypto.randomUUID();
    const foreignStep = crypto.randomUUID();
    const idempotencyKey = "phase1032:" + runId + ":step1:attempt1";
    const createdWorkflows: string[] = [];
    let syntheticOwnerId: string | null = null;

    try {
      // Give this test an isolated owner so the supported public claim RPC
      // cannot pick unrelated queued runs belonging to a shared fixture user.
      const syntheticEmail = "phase1032-" + crypto.randomUUID() + "@example.invalid";
      const syntheticPassword = crypto.randomUUID() + "Aa1!";
      const createdUser = await admin.auth.admin.createUser({
        email: syntheticEmail,
        password: syntheticPassword,
        email_confirm: true,
      });
      assert(!createdUser.error && Boolean(createdUser.data.user?.id),
        "synthetic auth user creation failed: " + (createdUser.error?.message ?? ""));
      syntheticOwnerId = createdUser.data.user.id;
      const ownerId = syntheticOwnerId;
      assert(UUID.test(ownerId), "synthetic owner ID must be a UUID");

      for (const [id, name] of [[workflowA, "phase-1032-primary"], [workflowB, "phase-1032-foreign"]] as const) {
        const { error } = await admin.from("workflows").insert({
          id, owner_id: ownerId, name, status: "draft", trigger_type: "manual",
        });
        assert(!error, "synthetic workflow insert failed: " + (error?.message ?? ""));
        createdWorkflows.push(id);
      }
      const { error: stepsError } = await admin.from("workflow_steps").insert([
        { id: step1, workflow_id: workflowA, step_order: 1, name: "complete", action_type: "test", config: {}, retry_limit: 0, timeout_seconds: 30 },
        { id: step2, workflow_id: workflowA, step_order: 2, name: "fail", action_type: "test", config: {}, retry_limit: 0, timeout_seconds: 30 },
        { id: foreignStep, workflow_id: workflowB, step_order: 1, name: "foreign", action_type: "test", config: {}, retry_limit: 0, timeout_seconds: 30 },
      ]);
      assert(!stepsError, "synthetic step insert failed: " + (stepsError?.message ?? ""));
      const { error: runError } = await admin.from("workflow_runs").insert({
        id: runId, workflow_id: workflowA, owner_id: ownerId,
        status: "queued", input: { synthetic: true, phase: "103.2" }, attempt: 0,
      });
      assert(!runError, "synthetic run insert failed: " + (runError?.message ?? ""));

      // Use only the supported public PostgREST facade. The internal
      // implementation lives in the private schema and is intentionally
      // unavailable through the public API. This synthetic owner has exactly
      // one queued run, so the owner-scoped public claim is deterministic.
      const claim = await admin.rpc("simula_claim_workflow_runs_lease_internal", {
        p_limit: 1, p_lease_seconds: 90, p_owner_id: ownerId,
      });
      assert(!claim.error && Array.isArray(claim.data) && claim.data.length === 1,
        "synthetic run lease claim failed: " + (claim.error?.message ?? ""));
      assert(claim.data[0]?.id === runId,
        "claim must return the exact synthetic run requested: " +
          JSON.stringify({ expectedRunId: runId, returnedRunIds: claim.data.map((row: { id: string }) => row.id) }));
      const lease = claim.data[0] as { id: string; attempt: number; lease_token: string; lease_until: string };
      assert(lease.attempt === 1 && UUID.test(lease.lease_token) && Date.parse(lease.lease_until) > Date.now(),
        "claim must return active generation and lease token");

      const identity = {
        p_owner_id: ownerId, p_run_id: runId, p_attempt: lease.attempt,
        p_lease_token: lease.lease_token,
      };
      const start = await admin.rpc("simula_start_workflow_step_with_lease", {
        ...identity, p_step_id: step1, p_input: { immutable: "first-write" },
      });
      assert(!start.error && Array.isArray(start.data) && start.data.length === 1,
        "valid lease must start a step: " + (start.error?.message ?? ""));
      const firstStepRunId = start.data[0].step_run_id;

      const replayStart = await admin.rpc("simula_start_workflow_step_with_lease", {
        ...identity, p_step_id: step1, p_input: { immutable: "must-not-overwrite" },
      });
      assert(!replayStart.error && replayStart.data?.[0]?.step_run_id === firstStepRunId &&
        replayStart.data?.[0]?.replayed === true,
        "same-generation running start must return the original step-run ID");
      const { data: preservedStep, error: preservedError } = await admin.from("workflow_step_runs")
        .select("id,input,status,attempt").eq("id", firstStepRunId).single();
      assert(!preservedError && preservedStep.input?.immutable === "first-write" &&
        preservedStep.status === "running" && preservedStep.attempt === 1,
        "idempotent start replay must not overwrite the original input");

      const foreignFailure = await admin.rpc("simula_fail_workflow_step_with_lease", {
        ...identity, p_step_id: foreignStep, p_error: "must-not-cross-workflow",
      });
      assert(Boolean(foreignFailure.error),
        "failure transition must reject a step belonging to another workflow");

      const secondStart = await admin.rpc("simula_start_workflow_step_with_lease", {
        ...identity, p_step_id: step2, p_input: { synthetic: true },
      });
      assert(!secondStart.error && secondStart.data?.length === 1,
        "second step must start under the same valid lease");
      const failure = await admin.rpc("simula_fail_workflow_step_with_lease", {
        ...identity, p_step_id: step2, p_error: "synthetic_expected_failure",
      });
      assert(!failure.error && failure.data?.length === 1,
        "valid lease must fail only its matching running step");
      const { data: failedStep, error: failedReadError } = await admin.from("workflow_step_runs")
        .select("status,error_message,attempt").eq("id", secondStart.data[0].step_run_id).single();
      assert(!failedReadError && failedStep.status === "failed" &&
        failedStep.error_message === "synthetic_expected_failure" && failedStep.attempt === 1,
        "failure transition must persist the expected terminal step state");

      const output = { synthetic: true, result: "phase-103.2-complete" };
      const completeArgs = {
        ...identity, p_step_id: step1, p_output: output,
        p_event_type: "phase1032.test.completed",
        p_idempotency_key: idempotencyKey,
        p_payload: { run_id: runId, step_id: step1, synthetic: true },
      };
      const completed = await admin.rpc("simula_complete_step_with_outbox_lease", completeArgs);
      assert(!completed.error && completed.data?.length === 1 &&
        completed.data[0].step_run_id === firstStepRunId &&
        UUID.test(completed.data[0].outbox_id) && completed.data[0].replayed === false,
        "valid lease must atomically complete step and create an outbox intent: " + (completed.error?.message ?? ""));

      const replayCompletion = await admin.rpc("simula_complete_step_with_outbox_lease", completeArgs);
      assert(!replayCompletion.error && replayCompletion.data?.[0]?.outbox_id === completed.data[0].outbox_id &&
        replayCompletion.data?.[0]?.replayed === true,
        "duplicate completion must return the same outbox identity deterministically");

      const staleToken = await admin.rpc("simula_start_workflow_step_with_lease", {
        ...identity, p_lease_token: crypto.randomUUID(), p_step_id: step1, p_input: {},
      });
      assert(Boolean(staleToken.error), "wrong lease token must be rejected");

      const { error: expireError } = await admin.from("workflow_runs")
        .update({ lease_until: new Date(Date.now() - 5_000).toISOString() })
        .eq("id", runId).eq("lease_token", lease.lease_token).eq("status", "running");
      assert(!expireError, "synthetic expiry setup failed: " + (expireError?.message ?? ""));

      const expiredStart = await admin.rpc("simula_start_workflow_step_with_lease", {
        ...identity, p_step_id: step1, p_input: {},
      });
      assert(Boolean(expiredStart.error), "expired lease must not start another step");

      const expiredFinish = await admin.rpc("simula_complete_step_with_outbox_lease", completeArgs);
      assert(Boolean(expiredFinish.error), "expired lease must not complete a step or create another outbox event");

      console.log("PHASE 103.2 LEASE-FENCED STEP TRANSITIONS: PASS");
    } finally {
      for (const workflowId of createdWorkflows.reverse()) {
        const { error } = await admin.from("workflows").delete().eq("id", workflowId);
        if (error) throw new Error("PHASE1032_FIXTURE_CLEANUP_FAILED: " + error.message);
      }
      if (syntheticOwnerId) {
        const { error } = await admin.auth.admin.deleteUser(syntheticOwnerId);
        if (error) throw new Error("PHASE1032_AUTH_FIXTURE_CLEANUP_FAILED: " + error.message);
      }
    }
  },
});
