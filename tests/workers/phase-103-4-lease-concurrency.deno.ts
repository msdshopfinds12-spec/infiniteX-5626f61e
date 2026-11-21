import { createClient } from "npm:@supabase/supabase-js@2.119.2";
import { createWorkflowStepCompletedEvent } from "../../supabase/functions/_shared/workflow-outbox-contract.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error("Missing Phase 103.4 environment value: " + name);
  return value;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.test({
  name: "Phase 103.4: concurrent claims are single-owner and stale generations are fenced",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    if (Deno.env.get("PHASE1034_ALLOW_DISPOSABLE_DB_WRITES") !== "true") {
      throw new Error("PHASE1034_BLOCKED: explicit disposable-database opt-in is required");
    }
    if (required("PHASE87_DATABASE_NAME") !== "infinitex_rehearsal") {
      throw new Error("PHASE1034_BLOCKED: only infinitex_rehearsal is permitted");
    }
    const url = required("PHASE81_POSTGREST_URL");
    const endpoint = new URL(url);
    if (endpoint.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "[::1]", "::1"].includes(endpoint.hostname) ||
      endpoint.port !== "3000") {
      throw new Error("PHASE1034_BLOCKED: writes require loopback PostgREST on port 3000");
    }
    const serviceJwt = required("PHASE81_SERVICE_JWT");
    const ownerId = required("PHASE1032_OWNER_ID");
    assert(UUID.test(ownerId), "pre-seeded disposable owner ID must be a UUID");

    const localFetch: typeof fetch = async (input, init) => {
      const source = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
      const target = new URL(source);
      if (target.pathname === "/rest/v1") target.pathname = "/";
      else if (target.pathname.startsWith("/rest/v1/")) target.pathname = target.pathname.slice("/rest/v1".length);

      // Preserve both Request.signal and init.signal while retaining the hard
      // 20-second diagnostic deadline. Never log request bodies or auth headers.
      const timeout = AbortSignal.timeout(20_000);
      const inheritedSignal = input instanceof Request ? input.signal : undefined;
      const signals = [inheritedSignal, init?.signal, timeout]
        .filter((value): value is AbortSignal => value != null);
      const signal = AbortSignal.any(signals);
      const isReplayRpc = target.pathname.endsWith(
        "/rpc/simula_complete_step_with_outbox_lease",
      );
      const requestId = crypto.randomUUID();
      const startedAt = performance.now();
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");

      try {
        const response = input instanceof Request
          ? await fetch(new Request(target, input), { ...init, signal })
          : await fetch(target, { ...init, signal });

        if (isReplayRpc) {
          console.error("PHASE1034_HTTP_RESPONSE", {
            requestId,
            method,
            pathname: target.pathname,
            durationMs: Math.round(performance.now() - startedAt),
            status: response.status,
            contentType: response.headers.get("content-type"),
            server: response.headers.get("server"),
          });
        }
        return response;
      } catch (error) {
        if (isReplayRpc) {
          console.error("PHASE1034_HTTP_TRANSPORT_ERROR", {
            requestId,
            method,
            pathname: target.pathname,
            durationMs: Math.round(performance.now() - startedAt),
            errorName: error instanceof Error ? error.name : "UnknownError",
            timeoutAborted: timeout.aborted,
            requestSignalAborted: inheritedSignal?.aborted ?? false,
            initSignalAborted: init?.signal?.aborted ?? false,
          });
        }
        throw error;
      }
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
    let testFailed = false;
    let primaryError: unknown;
    const cleanupErrors: string[] = [];

    try {
      const ownerFixture = await admin.from("workflows")
        .select("id,owner_id")
        .eq("id", "81000000-1000-4000-8000-000000000003")
        .eq("owner_id", ownerId)
        .maybeSingle();
      assert(!ownerFixture.error && ownerFixture.data !== null,
        "pre-seeded disposable owner fixture is missing or mismatched");

      // The owner-scoped claim can also terminalize expired final-attempt runs.
      // Prove this dedicated test owner has no eligible pre-existing work so
      // neither concurrent claimant can consume another test's fixture.
      const ownerQueueBefore = await admin.from("workflow_runs")
        .select("id,owner_id,status,attempt,lease_token,lease_until", { count: "exact" })
        .eq("owner_id", ownerId);
      assert(!ownerQueueBefore.error && Array.isArray(ownerQueueBefore.data) &&
        ownerQueueBefore.count === ownerQueueBefore.data.length,
        "cannot establish complete owner-scoped queue isolation");
      const now = Date.now();
      const eligibleOwnerRuns = ownerQueueBefore.data.filter((row) => {
        const attempt = Number(row.attempt);
        const expired = typeof row.lease_until === "string" &&
          Number.isFinite(Date.parse(row.lease_until)) && Date.parse(row.lease_until) <= now;
        return (row.status === "queued" && attempt < 5) ||
          (row.status === "running" && attempt < 5 && row.lease_token !== null && expired) ||
          (row.status === "running" && attempt >= 5 && expired);
      });
      assert(eligibleOwnerRuns.length === 0,
        "PHASE1034_BLOCKED: dedicated owner has pre-existing claimable or terminalizable runs");
      const unrelatedOwnerRunsBefore = ownerQueueBefore.data
        .map((row) => ({
          id: row.id, owner_id: row.owner_id, status: row.status,
          attempt: row.attempt, lease_token: row.lease_token, lease_until: row.lease_until,
        }))
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));

      const workflow = await admin.from("workflows").insert({
        id: workflowId, owner_id: ownerId, name: "phase-1034-concurrency",
        status: "draft", trigger_type: "manual",
      });
      assert(!workflow.error, "workflow fixture insert failed: " + (workflow.error?.message ?? ""));
      workflowCreated = true;

      const step = await admin.from("workflow_steps").insert({
        id: stepId, workflow_id: workflowId, step_order: 1,
        name: "generation-fenced-step", action_type: "test",
        config: {}, retry_limit: 0, timeout_seconds: 30,
      });
      assert(!step.error, "step fixture insert failed: " + (step.error?.message ?? ""));

      const run = await admin.from("workflow_runs").insert({
        id: runId, workflow_id: workflowId, owner_id: ownerId,
        status: "queued", input: { synthetic: true, phase: "103.4" }, attempt: 0,
      });
      assert(!run.error, "run fixture insert failed: " + (run.error?.message ?? ""));
      runCreated = true;

      // Two independent workers race for exactly one eligible run. PostgreSQL
      // row locking with SKIP LOCKED must ensure exactly one lease is issued.
      const claimArgs = { p_limit: 1, p_lease_seconds: 90, p_owner_id: ownerId };
      const [claimA, claimB] = await Promise.all([
        admin.rpc("simula_claim_workflow_runs_lease_internal", claimArgs),
        admin.rpc("simula_claim_workflow_runs_lease_internal", claimArgs),
      ]);
      assert(!claimA.error && !claimB.error,
        "concurrent claim requests must both complete without database errors");
      const leases = [...(claimA.data ?? []), ...(claimB.data ?? [])] as Array<{
        id: string; workflow_id: string; owner_id: string; attempt: number;
        lease_token: string; lease_until: string;
      }>;
      assert(leases.length === 1 && leases[0].id === runId,
        "exactly one concurrent worker may claim the single queued run");
      const firstLease = leases[0];
      assert(firstLease.owner_id === ownerId && firstLease.workflow_id === workflowId &&
        firstLease.attempt === 1 && UUID.test(firstLease.lease_token),
        "first generation must return the exact owner/run/attempt/token identity");

      const expire = await admin.from("workflow_runs")
        .update({ lease_until: new Date(Date.now() - 5_000).toISOString() })
        .eq("id", runId).eq("owner_id", ownerId).eq("attempt", firstLease.attempt)
        .eq("lease_token", firstLease.lease_token).eq("status", "running")
        .select("id").maybeSingle();
      assert(!expire.error && expire.data?.id === runId,
        "disposable lease expiry setup must update exactly the synthetic run");

      const reclaim = await admin.rpc("simula_claim_workflow_runs_lease_internal", claimArgs);
      assert(!reclaim.error && Array.isArray(reclaim.data) && reclaim.data.length === 1,
        "expired lease must be reclaimed by the next worker generation");
      const secondLease = reclaim.data[0] as typeof firstLease;
      assert(secondLease.id === runId && secondLease.owner_id === ownerId &&
        secondLease.attempt === 2 && UUID.test(secondLease.lease_token) &&
        secondLease.lease_token !== firstLease.lease_token,
        "reclaim must advance attempt and rotate the lease token");

      const firstIdentity = {
        p_owner_id: ownerId, p_run_id: runId, p_attempt: firstLease.attempt,
        p_lease_token: firstLease.lease_token,
      };
      const secondIdentity = {
        p_owner_id: ownerId, p_run_id: runId, p_attempt: secondLease.attempt,
        p_lease_token: secondLease.lease_token,
      };

      const staleHeartbeat = await admin.rpc("simula_heartbeat_workflow_run", {
        ...firstIdentity, p_extend_seconds: 90,
      });
      assert(Boolean(staleHeartbeat.error),
        "previous generation heartbeat must be rejected after lease reclaim");

      const staleStart = await admin.rpc("simula_start_workflow_step_with_lease", {
        ...firstIdentity, p_step_id: stepId, p_input: { generation: 1 },
      });
      assert(Boolean(staleStart.error),
        "previous generation must not create or overwrite a step after reclaim");

      const currentHeartbeat = await admin.rpc("simula_heartbeat_workflow_run", {
        ...secondIdentity, p_extend_seconds: 90,
      });
      assert(!currentHeartbeat.error && currentHeartbeat.data?.length === 1,
        "current generation must retain heartbeat authority");

      const start = await admin.rpc("simula_start_workflow_step_with_lease", {
        ...secondIdentity, p_step_id: stepId, p_input: { generation: 2 },
      });
      assert(!start.error && start.data?.length === 1,
        "current generation must start its matching step");

      const staleFailure = await admin.rpc("simula_fail_workflow_step_with_lease", {
        ...firstIdentity, p_step_id: stepId, p_error: "stale-generation-must-not-win",
      });
      assert(Boolean(staleFailure.error),
        "stale generation must not fail a step owned by the current generation");

      const event = createWorkflowStepCompletedEvent({ runId, stepId, attempt: secondLease.attempt });

      // A superseded generation must not complete the step or create an outbox row.
      const staleComplete = await admin.rpc("simula_complete_step_with_outbox_lease", {
        ...firstIdentity,
        p_step_id: stepId,
        p_output: { result: "stale-generation-must-not-win" },
        p_event_type: event.eventType,
        p_idempotency_key: event.idempotencyKey,
        p_payload: event.payload,
      });
      assert(Boolean(staleComplete.error),
        "stale generation completion must be rejected before any outbox write");

      const complete = await admin.rpc("simula_complete_step_with_outbox_lease", {
        ...secondIdentity,
        p_step_id: stepId,
        p_output: { result: "phase-103.4-pass" },
        p_event_type: event.eventType,
        p_idempotency_key: event.idempotencyKey,
        p_payload: event.payload,
      });
      assert(!complete.error && complete.data?.length === 1 &&
        complete.data[0]?.replayed === false &&
        typeof complete.data[0]?.step_run_id === "string" &&
        typeof complete.data[0]?.outbox_id === "string",
        "first current-generation completion must atomically create one step result and outbox event");

      // Exact replay must return the original identities, not create a second event.
      const replay = await admin.rpc("simula_complete_step_with_outbox_lease", {
        ...secondIdentity,
        p_step_id: stepId,
        p_output: { result: "phase-103.4-pass" },
        p_event_type: event.eventType,
        p_idempotency_key: event.idempotencyKey,
        p_payload: event.payload,
      });
      assert(!replay.error && replay.data?.length === 1 &&
        replay.data[0]?.replayed === true &&
        replay.data[0]?.step_run_id === complete.data[0].step_run_id &&
        replay.data[0]?.outbox_id === complete.data[0].outbox_id,
        "identical completion replay must return the original step and outbox IDs");

      // Reusing the same owner-scoped key with different event content must fail closed.
      const conflictingPayload = await admin.rpc("simula_complete_step_with_outbox_lease", {
        ...secondIdentity,
        p_step_id: stepId,
        p_output: { result: "phase-103.4-pass" },
        p_event_type: event.eventType,
        p_idempotency_key: event.idempotencyKey,
        p_payload: { ...event.payload, conflict_probe: true },
      });
      assert(
        conflictingPayload.error !== null &&
          conflictingPayload.error.message.includes("outbox_idempotency_conflict"),
        "same idempotency key with altered payload must raise outbox_idempotency_conflict",
      );

      // Refresh the disposable test lease immediately before the conflict probe.
      // This isolates outbox replay semantics from lease-expiry timing.
      const conflictLeaseHeartbeatAt = performance.now();
      const conflictLeaseHeartbeat = await admin.rpc("simula_heartbeat_workflow_run", {
        ...secondIdentity,
        p_extend_seconds: 90,
      });
      assert(
        !conflictLeaseHeartbeat.error && conflictLeaseHeartbeat.data?.length === 1,
        "current lease must be valid immediately before the altered-output replay probe",
      );

      // Matching event identity with a different step output must not be treated as replay.
      // Correlate this exact request with the concurrent read-only PostgreSQL sampler.
      console.error("PHASE1034_OUTPUT_REPLAY_BEGIN", {
        elapsedSinceLeaseHeartbeatMs: Math.round(performance.now() - conflictLeaseHeartbeatAt),
        startedAt: new Date().toISOString(),
      });
      const conflictingOutputArgs = {
        ...secondIdentity,
        p_step_id: stepId,
        p_output: { result: "different-output-must-not-replay" },
        p_event_type: event.eventType,
        p_idempotency_key: event.idempotencyKey,
        p_payload: event.payload,
      };

      // Compare the exact failing arguments against PostgreSQL directly before
      // the HTTP probes. This is diagnostic-only: the function's expected
      // exception is caught inside a DO block, so the probe cannot leave a
      // partial transaction behind. Hard-pin execution to the disposable
      // loopback rehearsal database and the same service_role execution role.
      const pgHost = Deno.env.get("PGHOST");
      const pgPort = Deno.env.get("PGPORT");
      const pgDatabase = Deno.env.get("PGDATABASE");
      assert(pgHost === "127.0.0.1" && pgPort === "5432" &&
        pgDatabase === "infinitex_rehearsal",
        "PHASE1034_BLOCKED: direct SQL probe requires the disposable loopback rehearsal database");
      const directSql = `
        SET statement_timeout = '5s';
        SET ROLE service_role;
        SELECT set_config('phase1034.args', :'phase1034_args', false);
        DO $phase1034$
        DECLARE
          v_args jsonb := current_setting('phase1034.args')::jsonb;
          v_state text;
          v_message text;
        BEGIN
          PERFORM * FROM public.simula_complete_step_with_outbox_lease(
            (v_args->>'p_owner_id')::uuid,
            (v_args->>'p_run_id')::uuid,
            (v_args->>'p_step_id')::uuid,
            (v_args->>'p_attempt')::integer,
            (v_args->>'p_lease_token')::uuid,
            v_args->'p_output',
            v_args->>'p_event_type',
            v_args->>'p_idempotency_key',
            v_args->'p_payload'
          );
          RAISE NOTICE 'PHASE1034_DIRECT_PG_REPLAY_RESULT outcome=returned';
        EXCEPTION WHEN OTHERS THEN
          GET STACKED DIAGNOSTICS
            v_state = RETURNED_SQLSTATE,
            v_message = MESSAGE_TEXT;
          RAISE NOTICE 'PHASE1034_DIRECT_PG_REPLAY_RESULT outcome=exception sqlstate=% message=%',
            v_state, v_message;
        END
        $phase1034$;
      `;
      const directPgStartedAt = performance.now();
      const directPg = await new Deno.Command("psql", {
        args: [
          "-X", "-v", "ON_ERROR_STOP=1",
          "-v", "phase1034_args=" + JSON.stringify(conflictingOutputArgs),
          "-c", directSql,
        ],
        stdout: "piped",
        stderr: "piped",
        env: { PGOPTIONS: "-c statement_timeout=5000", PGCONNECT_TIMEOUT: "5" },
      }).output();
      const directPgOutput = new TextDecoder().decode(directPg.stdout) +
        new TextDecoder().decode(directPg.stderr);
      const directPgResultLine = directPgOutput.split("\n").find((line) =>
        line.includes("PHASE1034_DIRECT_PG_REPLAY_RESULT")
      ) ?? null;
      console.error("PHASE1034_DIRECT_PG_REPLAY_DIAGNOSTIC", {
        durationMs: Math.round(performance.now() - directPgStartedAt),
        exitCode: directPg.code,
        resultLine: directPgResultLine,
      });
      assert(directPg.success && directPgResultLine !== null,
        "direct PostgreSQL diagnostic must complete and report its caught outcome");

      // First issue the exact RPC through raw HTTP. This separates the
      // PostgREST/HTTP result from any Supabase-js response handling.
      const rawHttpStartedAt = performance.now();
      const rawHttpResponse = await localFetch(
        new URL("/rest/v1/rpc/simula_complete_step_with_outbox_lease", url),
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + serviceJwt,
            apikey: serviceJwt,
            "Content-Type": "application/json",
            "Accept-Profile": "public",
            "Content-Profile": "public",
          },
          body: JSON.stringify(conflictingOutputArgs),
        },
      );
      const rawHttpBody = await rawHttpResponse.json().catch(() => null) as
        | { code?: unknown; message?: unknown }
        | null;
      const rawHttpErrorCode = typeof rawHttpBody?.code === "string"
        ? rawHttpBody.code
        : null;
      const rawHttpErrorMessage = typeof rawHttpBody?.message === "string"
        ? rawHttpBody.message
        : "";
      console.error("PHASE1034_RAW_HTTP_REPLAY_RESULT", {
        durationMs: Math.round(performance.now() - rawHttpStartedAt),
        status: rawHttpResponse.status,
        errorCode: rawHttpErrorCode,
        expectedMessageObserved: rawHttpErrorMessage.includes(
          "outbox_replay_step_state_mismatch",
        ),
      });
      assert(
        !rawHttpResponse.ok &&
          rawHttpErrorMessage.includes("outbox_replay_step_state_mismatch"),
        "raw PostgREST HTTP replay must return the expected altered-output mismatch",
      );

      const conflictRpcStartedAt = performance.now();
      const conflictingOutput = await admin.rpc(
        "simula_complete_step_with_outbox_lease",
        conflictingOutputArgs,
      );
      console.error("PHASE1034_OUTPUT_REPLAY_DIAGNOSTIC", {
        elapsedSinceLeaseHeartbeatMs: Math.round(
          performance.now() - conflictLeaseHeartbeatAt,
        ),
        conflictRpcDurationMs: Math.round(
          performance.now() - conflictRpcStartedAt,
        ),
        code: conflictingOutput.error?.code ?? null,
        message: conflictingOutput.error?.message ?? null,
        details: conflictingOutput.error?.details ?? null,
        hint: conflictingOutput.error?.hint ?? null,
        returnedRowCount: Array.isArray(conflictingOutput.data)
          ? conflictingOutput.data.length
          : null,
        replayed: conflictingOutput.data?.[0]?.replayed ?? null,
      });
      assert(
        conflictingOutput.error !== null &&
          conflictingOutput.error.message.includes("outbox_replay_step_state_mismatch"),
        "same event key with altered step output must raise outbox_replay_step_state_mismatch",
      );

      const staleFinish = await admin.rpc("simula_finish_workflow_run_lease", {
        ...firstIdentity, p_terminal_status: "failed", p_error: "stale-generation-must-not-finish",
      });
      assert(Boolean(staleFinish.error),
        "stale generation must not terminalize the reclaimed run");

      const finish = await admin.rpc("simula_finish_workflow_run_lease", {
        ...secondIdentity, p_terminal_status: "succeeded",
        p_output: { result: "phase-103.4-pass" },
      });
      assert(!finish.error && finish.data?.[0]?.status === "succeeded" &&
        finish.data[0]?.attempt === 2,
        "current generation must finish the run successfully");

      const finalRun = await admin.from("workflow_runs")
        .select("status,attempt,lease_token,lease_until")
        .eq("id", runId).single();
      assert(!finalRun.error && finalRun.data?.status === "succeeded" &&
        finalRun.data.attempt === 2 && finalRun.data.lease_token === null &&
        finalRun.data.lease_until === null,
        "terminal state must preserve attempt 2 and clear active lease fields");

      const unrelatedOwnerRunsAfter = await admin.from("workflow_runs")
        .select("id,owner_id,status,attempt,lease_token,lease_until", { count: "exact" })
        .eq("owner_id", ownerId).neq("id", runId);
      assert(!unrelatedOwnerRunsAfter.error && Array.isArray(unrelatedOwnerRunsAfter.data) &&
        unrelatedOwnerRunsAfter.count === unrelatedOwnerRunsAfter.data.length,
        "cannot verify complete owner-scoped queue after concurrency test");
      const unrelatedOwnerRunsSnapshotAfter = unrelatedOwnerRunsAfter.data
        .map((row) => ({
          id: row.id, owner_id: row.owner_id, status: row.status,
          attempt: row.attempt, lease_token: row.lease_token, lease_until: row.lease_until,
        }))
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
      assert(JSON.stringify(unrelatedOwnerRunsSnapshotAfter) === JSON.stringify(unrelatedOwnerRunsBefore),
        "concurrent owner-scoped claims changed an unrelated owner run");

      console.log("PHASE 103.4 CONCURRENCY AND STALE-GENERATION FENCING: PASS");
    } catch (error) {
      testFailed = true;
      primaryError = error;
    } finally {
      // Keep cleanup independent: attempt both exact synthetic fixture deletes,
      // but never allow a cleanup failure to erase the original test failure.
      if (runCreated) {
        try {
          const { data, error } = await admin.from("workflow_runs")
            .delete()
            .eq("id", runId)
            .eq("owner_id", ownerId)
            .select("id")
            .maybeSingle();
          if (error) cleanupErrors.push("run cleanup: " + error.message);
          else if (data?.id !== runId) cleanupErrors.push("run cleanup: exact synthetic run deletion was not confirmed");
        } catch (error) {
          cleanupErrors.push("run cleanup: " + String(error));
        }
      }
      if (workflowCreated) {
        try {
          const { data, error } = await admin.from("workflows")
            .delete()
            .eq("id", workflowId)
            .eq("owner_id", ownerId)
            .select("id")
            .maybeSingle();
          if (error) cleanupErrors.push("workflow cleanup: " + error.message);
          else if (data?.id !== workflowId) cleanupErrors.push("workflow cleanup: exact synthetic workflow deletion was not confirmed");
        } catch (error) {
          cleanupErrors.push("workflow cleanup: " + String(error));
        }
      }
    }

    if (testFailed && cleanupErrors.length > 0) {
      throw new AggregateError(
        [primaryError, ...cleanupErrors.map((message) => new Error(message))],
        "PHASE1034_TEST_AND_CLEANUP_FAILED: original test error preserved",
      );
    }
    if (testFailed) throw primaryError;
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        cleanupErrors.map((message) => new Error(message)),
        "PHASE1034_FIXTURE_CLEANUP_FAILED",
      );
    }
  },
});
