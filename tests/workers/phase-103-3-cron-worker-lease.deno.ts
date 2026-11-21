import { createClient } from "npm:@supabase/supabase-js@2.119.2";
import { createWorkflowStepCompletedEvent } from "../../supabase/functions/_shared/workflow-outbox-contract.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error("Missing Phase 103.3 environment value: " + name);
  return value;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.test({
  name: "Phase 103.3: cron lease lifecycle is fenced for a dedicated disposable owner",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    if (Deno.env.get("PHASE1033_ALLOW_DISPOSABLE_DB_WRITES") !== "true") {
      throw new Error("PHASE1033_BLOCKED: explicit disposable-database opt-in is required");
    }
    if (required("PHASE87_DATABASE_NAME") !== "infinitex_rehearsal") {
      throw new Error("PHASE1033_BLOCKED: only infinitex_rehearsal is permitted");
    }
    const url = required("PHASE81_POSTGREST_URL");
    const endpoint = new URL(url);
    if (endpoint.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "[::1]", "::1"].includes(endpoint.hostname) ||
      endpoint.port !== "3000") {
      throw new Error("PHASE1033_BLOCKED: writes require loopback PostgREST on port 3000");
    }
    const serviceJwt = required("PHASE81_SERVICE_JWT");
    const ownerId = required("PHASE1032_OWNER_ID");
    assert(UUID.test(ownerId), "pre-seeded disposable owner ID must be a UUID");

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

    const workflowId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    const stepId = crypto.randomUUID();
    let workflowCreated = false;
    let runCreated = false;
    try {
      const ownerFixture = await admin.from("workflows")
        .select("id,owner_id")
        .eq("id", "81000000-1000-4000-8000-000000000003")
        .eq("owner_id", ownerId)
        .maybeSingle();
      assert(!ownerFixture.error && ownerFixture.data !== null,
        "pre-seeded disposable owner fixture is missing or mismatched");

      const workflow = await admin.from("workflows").insert({
        id: workflowId, owner_id: ownerId, name: "phase-1033-cron-lease",
        status: "draft", trigger_type: "manual",
      });
      assert(!workflow.error, "workflow fixture insert failed: " + (workflow.error?.message ?? ""));
      workflowCreated = true;

      const step = await admin.from("workflow_steps").insert({
        id: stepId, workflow_id: workflowId, step_order: 1, name: "cron-fenced-step",
        action_type: "test", config: {}, retry_limit: 0, timeout_seconds: 30,
      });
      assert(!step.error, "step fixture insert failed: " + (step.error?.message ?? ""));

      const run = await admin.from("workflow_runs").insert({
        id: runId, workflow_id: workflowId, owner_id: ownerId,
        status: "queued", input: { synthetic: true, phase: "103.3" }, attempt: 0,
      });
      assert(!run.error, "run fixture insert failed: " + (run.error?.message ?? ""));
      runCreated = true;

      const claim = await admin.rpc("simula_claim_workflow_runs_lease_internal", {
        p_limit: 1, p_lease_seconds: 90, p_owner_id: ownerId,
      });
      assert(!claim.error && Array.isArray(claim.data) && claim.data.length === 1,
         "cron owner-scoped lease claim failed: " + (claim.error?.message ?? ""));
      const lease = claim.data[0] as {
        id: string; workflow_id: string; owner_id: string; attempt: number;
        lease_token: string; lease_until: string;
      };
      assert(lease.id === runId && lease.workflow_id === workflowId && lease.owner_id === ownerId,
        "owner-scoped cron claim must return the exact run and database owner identity");
      assert(lease.attempt === 1 && UUID.test(lease.lease_token) &&
        Date.parse(lease.lease_until) > Date.now(), "global claim must return a fresh active lease");

      const identity = {
        p_owner_id: ownerId, p_run_id: runId, p_attempt: lease.attempt,
        p_lease_token: lease.lease_token,
      };
      const heartbeat = await admin.rpc("simula_heartbeat_workflow_run", {
        ...identity, p_extend_seconds: 90,
      });
      assert(!heartbeat.error && Array.isArray(heartbeat.data) && heartbeat.data.length === 1,
        "current cron lease must heartbeat");

      const start = await admin.rpc("simula_start_workflow_step_with_lease", {
        ...identity, p_step_id: stepId, p_input: { synthetic: true },
      });
      assert(!start.error && Array.isArray(start.data) && start.data.length === 1,
        "cron lease must start the workflow step");

      const event = createWorkflowStepCompletedEvent({ runId, stepId, attempt: lease.attempt });
      const complete = await admin.rpc("simula_complete_step_with_outbox_lease", {
        ...identity,
        p_step_id: stepId,
        p_output: { result: "phase-103.3-pass" },
        p_event_type: event.eventType,
        p_idempotency_key: event.idempotencyKey,
        p_payload: event.payload,
      });
      assert(!complete.error && Array.isArray(complete.data) && complete.data.length === 1,
        "cron lease must complete the step and outbox atomically");

      const finish = await admin.rpc("simula_finish_workflow_run_lease", {
        ...identity, p_terminal_status: "succeeded",
        p_output: { result: "phase-103.3-pass" },
      });
      assert(!finish.error && Array.isArray(finish.data) &&
        finish.data[0]?.status === "succeeded" && finish.data[0]?.attempt === 1,
        "cron lease must finish the run through the fenced RPC");

      const staleFinish = await admin.rpc("simula_finish_workflow_run_lease", {
        ...identity, p_terminal_status: "failed", p_error: "stale-worker-must-not-overwrite",
      });
      assert(Boolean(staleFinish.error), "terminal lease must reject a stale second transition");

      const finalRun = await admin.from("workflow_runs")
        .select("status,attempt,lease_token,lease_until")
        .eq("id", runId).single();
      assert(!finalRun.error && finalRun.data?.status === "succeeded" &&
        finalRun.data.attempt === 1 && finalRun.data.lease_token === null &&
        finalRun.data.lease_until === null, "terminal run must clear active lease fields");

      console.log("Phase 103.3 trusted cron lease lifecycle verified in disposable PostgreSQL.");
    } finally {
      const cleanupErrors: string[] = [];
      if (runCreated) {
        try {
          const { error } = await admin.from("workflow_runs").delete().eq("id", runId);
          if (error) cleanupErrors.push("run cleanup: " + error.message);
        } catch (error) { cleanupErrors.push("run cleanup: " + String(error)); }
      }
      if (workflowCreated) {
        try {
          const { error } = await admin.from("workflows").delete().eq("id", workflowId);
          if (error) cleanupErrors.push("workflow cleanup: " + error.message);
        } catch (error) { cleanupErrors.push("workflow cleanup: " + String(error)); }
      }
      if (cleanupErrors.length) throw new Error("PHASE1033_FIXTURE_CLEANUP_FAILED: " + cleanupErrors.join("; "));
    }
  },
});
