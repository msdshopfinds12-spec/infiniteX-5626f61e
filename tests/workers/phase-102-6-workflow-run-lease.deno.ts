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
    const ownerId = "81000000-0000-4000-8000-000000000003";
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
      // The owner-scoped public facade intentionally exposes no run-ID filter.
      // Phase 81 consumes the shared owner-A fixtures before this isolated run.
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
        p_limit: 1, p_lease_seconds: 30, p_owner_id: "81000000-0000-4000-8000-000000000004",
      });
      assert(!wrongOwnerClaim.error && Array.isArray(wrongOwnerClaim.data) &&
        wrongOwnerClaim.data.length === 0,
        "owner-scoped claim must not disclose or claim another owner's run");

      // Concurrent claims against one queue row must produce exactly one owner.
      const claimArgs = { p_limit: 1, p_lease_seconds: 30, p_owner_id: ownerId };
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
      const { data: expiredRows, error: expireError } = await admin.from("workflow_runs")
        .update({ lease_until: "2000-01-01T00:00:00.000Z" })
        .eq("id", runId).eq("lease_token", first.lease_token).eq("status", "running")
        .select("id,owner_id,status,attempt,lease_until");
      assert(!expireError, "synthetic lease expiry setup failed: " + (expireError?.message ?? ""));
      console.error("PHASE1026_EXPIRY_UPDATE_DIAGNOSTIC", {
        matchedRowCount: Array.isArray(expiredRows) ? expiredRows.length : null,
        targetRunMatched: expiredRows?.[0]?.id === runId,
        status: expiredRows?.[0]?.status ?? null,
        attempt: expiredRows?.[0]?.attempt ?? null,
        leaseUntil: expiredRows?.[0]?.lease_until ?? null,
      });
      assert(Array.isArray(expiredRows) && expiredRows.length === 1 &&
        expiredRows[0]?.id === runId,
        "synthetic lease expiry must update exactly the intended fixture row");

      const expiredHeartbeat = await admin.rpc("simula_heartbeat_workflow_run", {
        p_run_id: runId, p_owner_id: ownerId, p_attempt: first.attempt,
        p_lease_token: first.lease_token, p_extend_seconds: 60,
      });
      assert(Boolean(expiredHeartbeat.error), "expired lease must not be resurrected");

      const { data: beforeReclaim, error: beforeReclaimError } = await admin
        .from("workflow_runs")
        .select("id,owner_id,status,attempt,lease_token,lease_until")
        .eq("id", runId)
        .maybeSingle();
      assert(!beforeReclaimError, "reclaim preflight inspection failed: " +
        (beforeReclaimError?.message ?? ""));
      assert(beforeReclaim?.owner_id === ownerId &&
        beforeReclaim.status === "running" &&
        beforeReclaim.attempt === first.attempt &&
        beforeReclaim.lease_token === first.lease_token &&
        Date.parse(beforeReclaim.lease_until) <= Date.parse("2000-01-01T00:00:00.000Z"),
        "reclaim precondition mismatch: " + JSON.stringify({
          found: Boolean(beforeReclaim),
          ownerMatches: beforeReclaim?.owner_id === ownerId,
          status: beforeReclaim?.status,
          attempt: beforeReclaim?.attempt,
          attemptExpected: first.attempt,
          tokenMatches: beforeReclaim?.lease_token === first.lease_token,
          leaseUntil: beforeReclaim?.lease_until,
        }));

      console.error("PHASE1026_RECLAIM_PRE_RPC", {
        targetRunId: runId,
        ownerMatches: beforeReclaim.owner_id === ownerId,
        status: beforeReclaim.status,
        attempt: beforeReclaim.attempt,
        tokenMatches: beforeReclaim.lease_token === first.lease_token,
        leaseUntil: beforeReclaim.lease_until,
        fixtureExpiryIsDeterministic: Date.parse(beforeReclaim.lease_until) <= Date.parse("2000-01-01T00:00:00.000Z"),
        requestedLimit: claimArgs.p_limit,
        requestedOwnerMatches: claimArgs.p_owner_id === ownerId,
      });
      const reclaimStartedAt = performance.now();
      const reclaim = await admin.rpc("simula_claim_workflow_runs_lease_internal", claimArgs);
      console.error("PHASE1026_RECLAIM_RPC_DIAGNOSTIC", {
        durationMs: Math.round(performance.now() - reclaimStartedAt),
        code: reclaim.error?.code ?? null,
        message: reclaim.error?.message ?? null,
        details: reclaim.error?.details ?? null,
        hint: reclaim.error?.hint ?? null,
        returnedRowCount: Array.isArray(reclaim.data) ? reclaim.data.length : null,
        returnedIds: Array.isArray(reclaim.data)
          ? reclaim.data.map((row: { id: string }) => row.id)
          : null,
        targetRunReturned: Array.isArray(reclaim.data) &&
          reclaim.data.some((row: { id: string }) => row.id === runId),
      });
      if (reclaim.error || !Array.isArray(reclaim.data)) {
        throw new Error("RECLAIM_RPC_FAILED: " + JSON.stringify({
          message: reclaim.error?.message ?? null,
          code: reclaim.error?.code ?? null,
          details: reclaim.error?.details ?? null,
          hint: reclaim.error?.hint ?? null,
        }));
      }
      const second = reclaim.data.find((row: { id: string }) => row.id === runId) as
        | { attempt: number; lease_token: string; lease_until: string } | undefined;
      if (!second) {
        const { data: afterReclaim, error: afterReclaimError } = await admin
          .from("workflow_runs")
          .select("id,owner_id,status,attempt,lease_token,lease_until")
          .eq("id", runId)
          .maybeSingle();
        throw new Error("RECLAIM_ROW_NOT_RETURNED: " + JSON.stringify({
          returnedRowCount: reclaim.data.length,
          returnedIds: reclaim.data.map((row: { id: string }) => row.id),
          afterReclaimError: afterReclaimError?.message ?? null,
          afterReclaim: afterReclaim ? {
            id: afterReclaim.id,
            ownerMatches: afterReclaim.owner_id === ownerId,
            status: afterReclaim.status,
            attempt: afterReclaim.attempt,
            tokenChanged: afterReclaim.lease_token !== first.lease_token,
            leaseUntil: afterReclaim.lease_until,
          } : null,
        }));
      }
      assert(second.attempt === 2,
        "reclaim generation mismatch: expected 2, received " + second.attempt);
      assert(UUID.test(second.lease_token), "reclaim returned an invalid lease token");
      assert(second.lease_token !== first.lease_token, "reclaim reused the previous lease token");
      const { data: afterReclaim, error: afterReclaimError } = await admin
        .from("workflow_runs")
        .select("id,owner_id,status,attempt,lease_token,lease_until,heartbeat_at")
        .eq("id", runId)
        .maybeSingle();
      assert(!afterReclaimError, "post-reclaim state inspection failed: " +
        (afterReclaimError?.message ?? ""));
      console.error("PHASE1026_RECLAIM_POST_STATE", {
        found: Boolean(afterReclaim),
        ownerMatches: afterReclaim?.owner_id === ownerId,
        status: afterReclaim?.status ?? null,
        attempt: afterReclaim?.attempt ?? null,
        tokenRotated: afterReclaim?.lease_token !== first.lease_token,
        returnedTokenMatchesPersisted: afterReclaim?.lease_token === second.lease_token,
        leaseUntil: afterReclaim?.lease_until ?? null,
        heartbeatAt: afterReclaim?.heartbeat_at ?? null,
      });
      assert(afterReclaim?.id === runId && afterReclaim.owner_id === ownerId &&
        afterReclaim.status === "running" && afterReclaim.attempt === 2 &&
        afterReclaim.lease_token === second.lease_token &&
        afterReclaim.lease_token !== first.lease_token &&
        afterReclaim.lease_until === second.lease_until &&
        afterReclaim.heartbeat_at !== null &&
        Date.parse(afterReclaim.lease_until) > Date.parse(afterReclaim.heartbeat_at),
        "reclaim result must match persisted running generation, rotated token and DB-generated lease timestamps");

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
