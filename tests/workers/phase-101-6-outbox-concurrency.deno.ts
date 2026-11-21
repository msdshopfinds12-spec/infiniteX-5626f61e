import { createClient } from "npm:@supabase/supabase-js@2.119.2";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error("Missing Phase 101.6 environment value: " + name);
  return value;
}

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

Deno.test({
  name: "Phase 101.6: concurrency, idempotency, rollback and expired-lease invariants",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    // Fail closed before constructing a privileged client. This suite may only
    // write to the disposable local PostgreSQL service created by CI.
    if (Deno.env.get("PHASE87_ALLOW_DISPOSABLE_DB_WRITES") !== "true") {
      throw new Error("PHASE1016_BLOCKED: explicit disposable-database opt-in is required");
    }
    const databaseName = required("PHASE87_DATABASE_NAME");
    if (databaseName !== "infinitex_rehearsal" && !databaseName.startsWith("infinitex_test_")) {
      throw new Error("PHASE1016_BLOCKED: database name is not an approved test database");
    }
    const url = required("PHASE81_POSTGREST_URL");
    const endpoint = new URL(url);
    if (endpoint.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "[::1]", "::1"].includes(endpoint.hostname) ||
      endpoint.port !== "3000") {
      throw new Error("PHASE1016_BLOCKED: writes require loopback HTTP PostgREST on port 3000");
    }
    const serviceJwt = required("PHASE81_SERVICE_JWT");
    const userId = required("PHASE81_USER_ID");
    assert(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(userId),
      "PHASE1016_BLOCKED: owner ID must be a canonical UUID");

    const admin = createClient(url, serviceJwt, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: "Bearer " + serviceJwt }, fetch: postgrestFetch },
    });
    const workflowId = "81000000-1000-4000-8000-000000000001";
    const stepId = "81000000-2000-4000-8000-000000000001";
    const runSame = crypto.randomUUID();
    const runRaceA = crypto.randomUUID();
    const runRaceB = crypto.randomUUID();
    const runIds = [runSame, runRaceA, runRaceB];

    try {
      const { error: runSeedError } = await admin.from("workflow_runs").insert(runIds.map((id, index) => ({
        id, workflow_id: workflowId, owner_id: userId, status: "running",
        input: { phase: "101.6", fixture: index }, attempt: 1,
      })));
      assert(!runSeedError, "synthetic workflow runs must be seeded: " + (runSeedError?.message ?? ""));

      const { error: stepSeedError } = await admin.from("workflow_step_runs").insert(runIds.map((run_id, index) => ({
        run_id, step_id: stepId, owner_id: userId, status: "running",
        input: { phase: "101.6", fixture: index }, attempt: 1,
      })));
      assert(!stepSeedError, "synthetic workflow steps must be seeded: " + (stepSeedError?.message ?? ""));

      const makeArgs = (runId: string, key: string) => ({
        p_owner_id: userId, p_run_id: runId, p_step_id: stepId, p_attempt: 1,
        p_output: { phase: "101.6", result: "synthetic" },
        p_event_type: "workflow.step.completed", p_idempotency_key: key,
        p_payload: { run_id: runId, step_id: stepId, attempt: 1 },
      });

      // Same-run calls should serialize: one creates, the other replays.
      const sameArgs = makeArgs(runSame, "workflow.step.completed:" + runSame + ":" + stepId + ":1");
      const sameResults = await Promise.all([
        admin.rpc("simula_complete_step_with_outbox", sameArgs),
        admin.rpc("simula_complete_step_with_outbox", sameArgs),
      ]);
      assert(sameResults.every(r => !r.error && Array.isArray(r.data) && r.data.length === 1),
        "identical concurrent same-run calls must both return one row: " +
        sameResults.map(r => r.error?.message ?? "ok").join("; "));
      const sameRows = sameResults.map(r => r.data![0]);
      assert(sameRows.filter((r: { replayed: boolean }) => !r.replayed).length === 1 &&
        sameRows.filter((r: { replayed: boolean }) => r.replayed).length === 1,
        "exactly one same-run caller must create and one must replay");
      assert(typeof sameRows[0].outbox_id === "string" &&
        sameRows[0].outbox_id === sameRows[1].outbox_id &&
        sameRows[0].step_run_id === sameRows[1].step_run_id,
        "same-run callers must receive the same durable event and step-run IDs");

      const eventTypeConflict = await admin.rpc("simula_complete_step_with_outbox", {
        ...sameArgs, p_event_type: "workflow.completed",
      });
      assert(Boolean(eventTypeConflict.error), "same key with a different event type must be rejected");
      const payloadConflict = await admin.rpc("simula_complete_step_with_outbox", {
        ...sameArgs, p_payload: { run_id: runSame, step_id: stepId, attempt: 2 },
      });
      assert(Boolean(payloadConflict.error), "same key with a different payload must be rejected");

      // A completion token must not authorize finishing an event after its lease
      // expires. This intentionally waits for the database-issued 60s lease:
      // changing the private row directly would bypass the public RPC contract.
      const firstClaim = await admin.rpc("simula_claim_workflow_outbox", { p_limit: 25 });
      assert(!firstClaim.error && Array.isArray(firstClaim.data),
        "outbox claim must return a bounded claim batch");
      const leasedEvent = firstClaim.data.find((row: { idempotency_key: string }) =>
        row.idempotency_key === sameArgs.p_idempotency_key);
      assert(leasedEvent && typeof leasedEvent.lock_token === "string" &&
        typeof leasedEvent.lease_until === "string",
        "the fixture event must receive a database-issued lease");
      const leaseDeadline = Date.parse(leasedEvent.lease_until);
      assert(Number.isFinite(leaseDeadline), "outbox lease deadline must be a valid timestamp");
      const waitMs = leaseDeadline - Date.now() + 150;
      assert(waitMs >= 0 && waitMs <= 65_000,
        "outbox lease must be within the expected bounded 60-second window");
      if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));

      const expiredFinish = await admin.rpc("simula_finish_workflow_outbox", {
        p_id: leasedEvent.id,
        p_lock_token: leasedEvent.lock_token,
        p_succeeded: true,
      });
      assert(Boolean(expiredFinish.error),
        "an expired outbox lease must not be completed even when its token matches");

      const reclaimedBatch = await admin.rpc("simula_claim_workflow_outbox", { p_limit: 25 });
      assert(!reclaimedBatch.error && Array.isArray(reclaimedBatch.data),
        "expired outbox event must be eligible for recovery");
      const reclaimedEvent = reclaimedBatch.data.find((row: { idempotency_key: string }) =>
        row.idempotency_key === sameArgs.p_idempotency_key);
      assert(reclaimedEvent && typeof reclaimedEvent.lock_token === "string" &&
        reclaimedEvent.lock_token !== leasedEvent.lock_token,
        "recovery must issue a fresh lease token");
      const recoveredFinish = await admin.rpc("simula_finish_workflow_outbox", {
        p_id: reclaimedEvent.id,
        p_lock_token: reclaimedEvent.lock_token,
        p_succeeded: true,
      });
      assert(!recoveredFinish.error && recoveredFinish.data?.[0]?.status === "succeeded",
        "the current unexpired lease token must be allowed to finish the event");

      // Independent runs contend for one owner-scoped idempotency key.
      const crossKey = "workflow.step.completed:" + runRaceA + ":" + stepId + ":1";
      const crossResults = await Promise.all([
        admin.rpc("simula_complete_step_with_outbox", makeArgs(runRaceA, crossKey)),
        admin.rpc("simula_complete_step_with_outbox", makeArgs(runRaceB, crossKey)),
      ]);
      assert(crossResults.filter(r => !r.error).length === 1 &&
        crossResults.filter(r => Boolean(r.error)).length === 1,
        "exactly one independent run may commit a shared owner/key race");

      const { data: states, error: stateError } = await admin.from("workflow_step_runs")
        .select("run_id,status").in("run_id", [runRaceA, runRaceB]);
      assert(!stateError && states?.length === 2, "both cross-run fixtures must remain queryable");
      assert(states.filter((r: { status: string }) => r.status === "succeeded").length === 1 &&
        states.filter((r: { status: string }) => r.status === "running").length === 1,
        "losing cross-run transaction must roll back its step completion");

      console.log("Phase 101.6 verified: replay, idempotency conflicts, rollback, lease expiry and recovery");
    } finally {
      // UUID-scoped cleanup only; both operations are attempted independently.
      // allSettled also handles rejected network promises: one failed request
      // must never prevent the other scoped cleanup request from being attempted.
      const cleanupResults = await Promise.allSettled([
        admin.from("workflow_step_runs").delete().in("run_id", runIds),
        admin.from("workflow_runs").delete().in("id", runIds),
      ]);
      const cleanupFailures = cleanupResults.flatMap((result, index) => {
        const label = index === 0 ? "step cleanup" : "run cleanup";
        if (result.status === "rejected") {
          return [label + " rejected: " + String(result.reason)];
        }
        return result.value.error ? [label + ": " + result.value.error.message] : [];
      });
      if (cleanupFailures.length > 0) {
        throw new Error("PHASE1016_FIXTURE_CLEANUP_FAILED: " + cleanupFailures.join("; "));
      }
    }
  },
});
