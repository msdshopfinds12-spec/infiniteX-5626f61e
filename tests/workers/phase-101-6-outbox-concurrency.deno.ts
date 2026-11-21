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
  name: "Phase 101.6: lease-fenced completion, idempotency, rollback and outbox recovery",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
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
    const ownerId = required("PHASE81_USER_ID");
    assert(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ownerId),
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
    let runsCreated = false;

    try {
      const { error: seedError } = await admin.from("workflow_runs").insert(runIds.map((id, index) => ({
        id, workflow_id: workflowId, owner_id: ownerId, status: "queued",
        input: { phase: "101.6", fixture: index }, attempt: 0,
      })));
      assert(!seedError, "synthetic queued runs must be seeded: " + (seedError?.message ?? ""));
      runsCreated = true;

      // Claim all fixtures through the same owner-scoped lease facade used by
      // the workers. No direct lease-token or attempt mutation is permitted.
      const claim = await admin.rpc("simula_claim_workflow_runs_lease_internal", {
        p_limit: 3, p_lease_seconds: 90, p_owner_id: ownerId,
      });
      assert(!claim.error && Array.isArray(claim.data), "owner-scoped lease claim failed: " + (claim.error?.message ?? ""));
      const leases = claim.data.filter((row: { id: string }) => runIds.includes(row.id));
      assert(leases.length === 3, "all three synthetic runs must receive distinct leases");
      const byRun = new Map(leases.map((row: {
        id: string; owner_id: string; attempt: number; lease_token: string; lease_until: string;
      }) => [row.id, row]));
      for (const id of runIds) {
        const lease = byRun.get(id) as {
          id: string; owner_id: string; attempt: number; lease_token: string; lease_until: string;
        } | undefined;
        assert(lease && lease.owner_id === ownerId && lease.attempt === 1 &&
          /^[0-9a-f-]{36}$/i.test(lease.lease_token) && Date.parse(lease.lease_until) > Date.now(),
          "each fixture must receive a valid current lease");
        const start = await admin.rpc("simula_start_workflow_step_with_lease", {
          p_owner_id: ownerId, p_run_id: id, p_step_id: stepId,
          p_attempt: lease.attempt, p_lease_token: lease.lease_token,
          p_input: { phase: "101.6", run_id: id },
        });
        assert(!start.error && Array.isArray(start.data) && start.data.length === 1,
          "fenced step start must succeed: " + (start.error?.message ?? ""));
      }

      const makeArgs = (runId: string, key: string) => {
        const lease = byRun.get(runId) as {
          attempt: number; lease_token: string;
        };
        return {
          p_owner_id: ownerId, p_run_id: runId, p_step_id: stepId,
          p_attempt: lease.attempt, p_lease_token: lease.lease_token,
          p_output: { phase: "101.6", result: "synthetic" },
          p_event_type: "workflow.step.completed", p_idempotency_key: key,
          p_payload: { run_id: runId, step_id: stepId, attempt: lease.attempt },
        };
      };
      const complete = (args: Record<string, unknown>) =>
        admin.rpc("simula_complete_step_with_outbox_lease", args);

      // Same-run calls serialize through run -> step -> outbox lock order:
      // one creates the durable event and the other receives an exact replay.
      const sameKey = "workflow.step.completed:" + runSame + ":" + stepId + ":1";
      const sameArgs = makeArgs(runSame, sameKey);
      const sameResults = await Promise.all([complete(sameArgs), complete(sameArgs)]);
      assert(sameResults.every(r => !r.error && Array.isArray(r.data) && r.data.length === 1),
        "identical concurrent fenced completions must both return one row: " +
        sameResults.map(r => r.error?.message ?? "ok").join("; "));
      const sameRows = sameResults.map(r => r.data![0]);
      assert(sameRows.filter((r: { replayed: boolean }) => !r.replayed).length === 1 &&
        sameRows.filter((r: { replayed: boolean }) => r.replayed).length === 1,
        "exactly one same-run caller must create and one must replay");
      assert(typeof sameRows[0].outbox_id === "string" &&
        sameRows[0].outbox_id === sameRows[1].outbox_id &&
        sameRows[0].step_run_id === sameRows[1].step_run_id,
        "same-run callers must receive identical durable event and step-run IDs");

      const eventTypeConflict = await complete({ ...sameArgs, p_event_type: "workflow.completed" });
      assert(Boolean(eventTypeConflict.error), "same key with a different event type must be rejected");
      const payloadConflict = await complete({
        ...sameArgs, p_payload: { run_id: runSame, step_id: stepId, attempt: 2 },
      });
      assert(Boolean(payloadConflict.error), "same key with a different payload must be rejected");

      // Claim and expire only this fixture event, then verify the database
      // rejects stale completion and permits recovery with a fresh token.
      const firstClaim = await admin.rpc("simula_claim_workflow_outbox", { p_limit: 25 });
      assert(!firstClaim.error && Array.isArray(firstClaim.data), "outbox claim must return a bounded batch");
      const leasedEvent = firstClaim.data.find((row: { idempotency_key: string }) =>
        row.idempotency_key === sameKey);
      assert(leasedEvent && typeof leasedEvent.lock_token === "string" &&
        typeof leasedEvent.lease_until === "string", "fixture event must receive a database-issued lease");
      const leaseDeadline = Date.parse(leasedEvent.lease_until);
      assert(Number.isFinite(leaseDeadline), "outbox lease deadline must be valid");
      const waitMs = leaseDeadline - Date.now() + 150;
      assert(waitMs >= 0 && waitMs <= 65_000, "outbox lease must fit the expected bounded 60-second window");
      if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));

      const expiredFinish = await admin.rpc("simula_finish_workflow_outbox", {
        p_id: leasedEvent.id, p_lock_token: leasedEvent.lock_token, p_succeeded: true,
      });
      assert(Boolean(expiredFinish.error), "expired outbox lease must not be completed with its stale token");

      let reclaimedEvent: { id: string; lock_token: string; idempotency_key: string } | undefined;
      for (let batch = 0; batch < 10 && !reclaimedEvent; batch++) {
        const result = await admin.rpc("simula_claim_workflow_outbox", { p_limit: 25 });
        assert(!result.error && Array.isArray(result.data), "expired outbox event must be eligible for recovery");
        reclaimedEvent = result.data.find((row: { idempotency_key: string }) => row.idempotency_key === sameKey);
      }
      assert(reclaimedEvent && typeof reclaimedEvent.lock_token === "string" &&
        reclaimedEvent.lock_token !== leasedEvent.lock_token,
        "recovery must issue a fresh outbox lease token");
      const recoveredFinish = await admin.rpc("simula_finish_workflow_outbox", {
        p_id: reclaimedEvent.id, p_lock_token: reclaimedEvent.lock_token, p_succeeded: true,
      });
      assert(!recoveredFinish.error && recoveredFinish.data?.[0]?.status === "succeeded",
        "current unexpired outbox token must finish the event");

      // Independent run locks contend for one owner-scoped idempotency key.
      // Exactly one transaction commits; the losing transaction rolls back its step.
      const crossKey = "workflow.step.completed:" + runRaceA + ":" + stepId + ":1";
      const crossResults = await Promise.all([
        complete(makeArgs(runRaceA, crossKey)),
        complete(makeArgs(runRaceB, crossKey)),
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

      console.log("Phase 101.6 verified: lease-fenced completion, idempotency, rollback and outbox recovery");
    } finally {
      if (runsCreated) {
        const cleanup = await Promise.allSettled([
          admin.from("workflow_step_runs").delete().in("run_id", runIds),
          admin.from("workflow_runs").delete().in("id", runIds),
        ]);
        const failures = cleanup.flatMap((result, index) => {
          const label = index === 0 ? "step cleanup" : "run cleanup";
          if (result.status === "rejected") return [label + " rejected: " + String(result.reason)];
          return result.value.error ? [label + ": " + result.value.error.message] : [];
        });
        if (failures.length) throw new Error("PHASE1016_FIXTURE_CLEANUP_FAILED: " + failures.join("; "));
      }
    }
  },
});
