import { createClient } from "npm:@supabase/supabase-js@2.119.2";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error("Missing Phase 102.6 environment value: " + name);
  return value;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.test({
  name: "Phase 102.6: database-owned run lease, heartbeat, expiry, fencing and terminal transition",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    if (Deno.env.get("PHASE1026_ALLOW_DISPOSABLE_DB_WRITES") !== "true") {
      throw new Error("PHASE1026_BLOCKED: explicit disposable-database opt-in is required");
    }
    const databaseName = required("PHASE87_DATABASE_NAME");
    if (databaseName !== "infinitex_rehearsal" && !databaseName.startsWith("infinitex_test_")) {
      throw new Error("PHASE1026_BLOCKED: database name is not an approved test database");
    }
    const url = required("PHASE81_POSTGREST_URL");
    const endpoint = new URL(url);
    if (endpoint.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "[::1]", "::1"].includes(endpoint.hostname) ||
      endpoint.port !== "3000") {
      throw new Error("PHASE1026_BLOCKED: writes require loopback HTTP PostgREST on port 3000");
    }
    const serviceJwt = required("PHASE81_SERVICE_JWT");
    const ownerId = required("PHASE81_USER_ID");
    assert(UUID.test(ownerId), "PHASE1026_BLOCKED: owner ID must be a canonical UUID");

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
    const admin = createClient(url, serviceJwt, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: "Bearer " + serviceJwt }, fetch: postgrestFetch },
    });

    const workflowId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    let workflowCreated = false;
    try {
      // The optional p_run_id filter keeps this integration fixture isolated
      // from the other queued rows seeded by the shared Phase 81 harness.
      const { error: workflowError } = await admin.from("workflows").insert({
        id: workflowId, owner_id: ownerId, name: "phase-1026-lease-fixture",
        status: "draft", trigger_type: "manual",
      });
      assert(!workflowError, "synthetic workflow seed failed: " + (workflowError?.message ?? ""));
      workflowCreated = true;

      const { error: runError } = await admin.from("workflow_runs").insert({
        id: runId, workflow_id: workflowId, owner_id: ownerId,
        status: "queued", input: { phase: "102.6", synthetic: true }, attempt: 0,
      });
      assert(!runError, "synthetic run seed failed: " + (runError?.message ?? ""));

      // A different authenticated owner scope must never claim this run.
      const wrongOwnerClaim = await admin.rpc("simula_claim_workflow_runs_lease_internal", {
        p_limit: 1, p_lease_seconds: 30, p_run_id: runId, p_owner_id: crypto.randomUUID(),
      });
      assert(!wrongOwnerClaim.error && Array.isArray(wrongOwnerClaim.data) &&
        wrongOwnerClaim.data.length === 0,
        "owner-scoped claim must not disclose or claim another owner's run");

      // Concurrent claims against one queue row must produce exactly one owner.
      const claimArgs = { p_limit: 1, p_lease_seconds: 30, p_run_id: runId, p_owner_id: ownerId };
      const claims = await Promise.all([
        admin.rpc("simula_claim_workflow_runs_lease_internal", claimArgs),
        admin.rpc("simula_claim_workflow_runs_lease_internal", claimArgs),
      ]);
      assert(claims.every(result => !result.error && Array.isArray(result.data)),
        "concurrent lease claim RPC failed: " + claims.map(x => x.error?.message ?? "ok").join("; "));
      const claimed = claims.flatMap(result => result.data ?? [])
        .filter((row: { id: string }) => row.id === runId);
      assert(claimed.length === 1, "exactly one concurrent claimant must own the fixture run");

      const first = claimed[0] as {
        id: string; owner_id: string; attempt: number;
        lease_token: string; lease_until: string;
      };
      assert(first.owner_id === ownerId && first.attempt === 1 &&
        UUID.test(first.lease_token) && Date.parse(first.lease_until) > Date.now(),
        "claim must return owner, generation, fresh token and future database expiry");

      const heartbeat = await admin.rpc("simula_heartbeat_workflow_run", {
        p_run_id: runId, p_owner_id: ownerId, p_attempt: first.attempt,
        p_lease_token: first.lease_token, p_extend_seconds: 60,
      });
      assert(!heartbeat.error && Array.isArray(heartbeat.data) && heartbeat.data.length === 1,
        "current unexpired lease must heartbeat successfully");

      const staleToken = await admin.rpc("simula_heartbeat_workflow_run", {
        p_run_id: runId, p_owner_id: ownerId, p_attempt: first.attempt,
        p_lease_token: crypto.randomUUID(), p_extend_seconds: 60,
      });
      assert(Boolean(staleToken.error), "a non-matching lease token must be rejected");

      // Simulate worker loss by expiring only this synthetic fixture row.
      // This direct mutation is permitted solely in the opt-in disposable DB.
      const { error: expireError } = await admin.from("workflow_runs")
        .update({ lease_until: new Date(Date.now() - 5_000).toISOString() })
        .eq("id", runId).eq("lease_token", first.lease_token).eq("status", "running");
      assert(!expireError, "synthetic lease expiry setup failed: " + (expireError?.message ?? ""));

      const expiredHeartbeat = await admin.rpc("simula_heartbeat_workflow_run", {
        p_run_id: runId, p_owner_id: ownerId, p_attempt: first.attempt,
        p_lease_token: first.lease_token, p_extend_seconds: 60,
      });
      assert(Boolean(expiredHeartbeat.error), "expired lease must not be resurrected");

      const reclaim = await admin.rpc("simula_claim_workflow_runs_lease_internal", claimArgs);
      assert(!reclaim.error && Array.isArray(reclaim.data), "expired run reclaim RPC failed");
      const second = reclaim.data.find((row: { id: string }) => row.id === runId) as
        | { attempt: number; lease_token: string; lease_until: string } | undefined;
      assert(second && second.attempt === 2 && UUID.test(second.lease_token) &&
        second.lease_token !== first.lease_token && Date.parse(second.lease_until) > Date.now(),
        "reclaim must advance generation and issue a fresh, unexpired token");

      const staleFinish = await admin.rpc("simula_finish_workflow_run_lease", {
        p_run_id: runId, p_owner_id: ownerId, p_attempt: first.attempt,
        p_lease_token: first.lease_token, p_terminal_status: "succeeded",
        p_output: { stale: true },
      });
      assert(Boolean(staleFinish.error), "superseded worker must not finish the reclaimed run");

      const nullStatus = await admin.rpc("simula_finish_workflow_run_lease", {
        p_run_id: runId, p_owner_id: ownerId, p_attempt: second.attempt,
        p_lease_token: second.lease_token, p_terminal_status: null,
      });
      assert(Boolean(nullStatus.error), "null terminal status must be rejected");

      const finish = await admin.rpc("simula_finish_workflow_run_lease", {
        p_run_id: runId, p_owner_id: ownerId, p_attempt: second.attempt,
        p_lease_token: second.lease_token, p_terminal_status: "succeeded",
        p_output: { phase: "102.6", result: "synthetic-success" },
      });
      assert(!finish.error && Array.isArray(finish.data) &&
        finish.data[0]?.status === "succeeded" && finish.data[0]?.attempt === 2,
        "current generation must complete exactly once");

      const { data: finalRun, error: finalError } = await admin.from("workflow_runs")
        .select("status,attempt,lease_token,lease_until,heartbeat_at")
        .eq("id", runId).single();
      assert(!finalError && finalRun?.status === "succeeded" &&
        finalRun.attempt === 2 && finalRun.lease_token === null &&
        finalRun.lease_until === null && finalRun.heartbeat_at !== null,
        "terminal transition must clear active lease fields and retain heartbeat diagnostics");

      console.log("Phase 102.6 lease contract verified in disposable PostgreSQL.");
    } finally {
      const cleanup = await Promise.allSettled([
        admin.from("workflow_runs").delete().eq("id", runId),
        workflowCreated
          ? admin.from("workflows").delete().eq("id", workflowId)
          : Promise.resolve({ error: null }),
      ]);
      const failures = cleanup.flatMap((result, index) => {
        const label = index === 0 ? "run cleanup" : "workflow cleanup";
        if (result.status === "rejected") return [label + " rejected: " + String(result.reason)];
        return result.value.error ? [label + ": " + result.value.error.message] : [];
      });
      if (failures.length) throw new Error("PHASE1026_FIXTURE_CLEANUP_FAILED: " + failures.join("; "));
    }
  },
});
