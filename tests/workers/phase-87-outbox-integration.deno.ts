import { createClient } from "npm:@supabase/supabase-js@2.119.2";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error("Missing Phase 87 environment value: " + name);
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

Deno.test({
  name: "Phase 87.1: transactional outbox idempotency, concurrent claims, retry and lease fencing",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    // This integration suite performs real database writes. It is restricted
    // to an explicitly named, local disposable database; hosted/shared targets
    // fail closed before a client is created.
    if (Deno.env.get("PHASE87_ALLOW_DISPOSABLE_DB_WRITES") !== "true") {
      throw new Error("PHASE87_BLOCKED: explicit disposable-database opt-in is required");
    }
    const databaseName = required("PHASE87_DATABASE_NAME");
    if (databaseName !== "infinitex_rehearsal" && !databaseName.startsWith("infinitex_test_")) {
      throw new Error("PHASE87_BLOCKED: database name is not an approved test database");
    }
    const url = required("PHASE81_POSTGREST_URL");
    const endpoint = new URL(url);
    if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(endpoint.hostname)) {
      throw new Error("PHASE87_BLOCKED: integration writes are restricted to loopback PostgREST");
    }
    const serviceJwt = required("PHASE81_SERVICE_JWT");
    const userId = required("PHASE81_USER_ID");
    assert(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(userId),
      "PHASE87_BLOCKED: owner ID must be a canonical UUID");
    const admin = createClient(url, serviceJwt, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: { Authorization: "Bearer " + serviceJwt },
        fetch: postgrestFetch,
      },
    });

    const runId = crypto.randomUUID();
    const stepId = "81000000-2000-4000-8000-000000000001";
    const workflowId = "81000000-1000-4000-8000-000000000001";
    try {
    console.log("Phase 87: inserting synthetic outbox workflow run");
    const { error: runInsertError } = await admin.from("workflow_runs").insert({
      id: runId,
      workflow_id: workflowId,
      owner_id: userId,
      status: "running",
      input: { seed: "phase87-outbox" },
      attempt: 1,
    });
    assert(!runInsertError, "disposable outbox run must be seeded: " + (runInsertError?.message ?? ""));

    const { error: stepInsertError } = await admin.from("workflow_step_runs").insert({
      run_id: runId,
      step_id: stepId,
      owner_id: userId,
      status: "running",
      input: { seed: "phase87-outbox" },
      attempt: 1,
    });
    assert(!stepInsertError, "disposable outbox step must be seeded: " + (stepInsertError?.message ?? ""));

    const completionArgs = {
      p_owner_id: userId,
      p_run_id: runId,
      p_step_id: stepId,
      p_attempt: 1,
      p_output: { transformed: true },
      p_event_type: "notification.requested",
      p_idempotency_key: "phase87-disposable-notification:" + runId,
      p_payload: { recipient_ref: "synthetic-user-a", template: "test-only" },
    };

    console.log("Phase 87: creating transactional completion and outbox event");
    const { data: first, error: firstError } = await admin.rpc(
      "simula_complete_step_with_outbox",
      completionArgs,
    );
    assert(!firstError && first?.length === 1 && first[0].replayed === false,
      "first completion must atomically finish the step and create one outbox event: " + (firstError?.message ?? ""));
    const outboxId = first[0].outbox_id;
    assert(typeof outboxId === "string", "first completion must return a durable outbox ID");

    console.log("Phase 87: verifying idempotent replay");
    const { data: replay, error: replayError } = await admin.rpc(
      "simula_complete_step_with_outbox",
      completionArgs,
    );
    assert(!replayError && replay?.[0]?.replayed === true && replay[0].outbox_id === outboxId,
      "same idempotency key and payload must replay the original outbox event");

    const { error: conflictError } = await admin.rpc("simula_complete_step_with_outbox", {
      ...completionArgs,
      p_payload: { recipient_ref: "different-recipient", template: "test-only" },
    });
    assert(Boolean(conflictError), "same idempotency key with a different payload must be rejected");

    const claimArgs = { p_limit: 5 };
    console.log("Phase 87: claiming outbox event concurrently");
    const [claimA, claimB] = await Promise.all([
      admin.rpc("simula_claim_workflow_outbox", claimArgs),
      admin.rpc("simula_claim_workflow_outbox", claimArgs),
    ]);
    assert(!claimA.error && !claimB.error, "parallel outbox claim RPCs must succeed");
    const claimed = [...(claimA.data ?? []), ...(claimB.data ?? [])]
      .filter((event: { id: string }) => event.id === outboxId);
    assert(claimed.length === 1 && claimed[0].attempts === 1,
      "parallel claimers must lease the same outbox event to exactly one worker");
    const firstLease = claimed[0];

    const { data: failedFinish, error: failedFinishError } = await admin.rpc(
      "simula_finish_workflow_outbox",
      {
        p_id: outboxId,
        p_lock_token: firstLease.lock_token,
        p_succeeded: false,
        p_error: "synthetic_transient_failure",
      },
    );
    assert(!failedFinishError && failedFinish?.[0]?.status === "pending",
      "transient delivery failure must return the event to pending with backoff");

    console.log("Phase 87: retry backoff observed; waiting for next eligible claim");
    await new Promise((resolve) => setTimeout(resolve, 5500));
    const { data: secondClaims, error: secondClaimError } = await admin.rpc(
      "simula_claim_workflow_outbox",
      { p_limit: 5 },
    );
    assert(!secondClaimError, "outbox retry claim must succeed");
    const secondLease = (secondClaims ?? []).find(
      (event: { id: string; attempts: number; lock_token: string }) => event.id === outboxId,
    );
    assert(secondLease && secondLease.attempts === 2 && secondLease.lock_token !== firstLease.lock_token,
      "retry must issue a new lease token and increment attempt count");

    const { error: staleLeaseError } = await admin.rpc("simula_finish_workflow_outbox", {
      p_id: outboxId,
      p_lock_token: firstLease.lock_token,
      p_succeeded: false,
      p_error: "stale_worker_must_not_commit",
    });
    assert(Boolean(staleLeaseError), "stale outbox lease token must not complete a newer delivery attempt");

    console.log("Phase 87: confirming stale lease rejection and current lease success");
    const { data: successfulFinish, error: successfulFinishError } = await admin.rpc(
      "simula_finish_workflow_outbox",
      {
        p_id: outboxId,
        p_lock_token: secondLease.lock_token,
        p_succeeded: true,
        p_error: null,
      },
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
    console.log("Phase 87: transactional outbox integration verified");
    } finally {
      // Remove only records owned by this invocation. A failed cleanup fails
      // the test so fixture residue cannot be silently ignored.
      const stepCleanup = await admin.from("workflow_step_runs").delete().eq("run_id", runId);
      assert(!stepCleanup.error, "phase87 step fixture cleanup failed: " + (stepCleanup.error?.message ?? ""));
      const runCleanup = await admin.from("workflow_runs").delete().eq("id", runId);
      assert(!runCleanup.error, "phase87 run fixture cleanup failed: " + (runCleanup.error?.message ?? ""));
    }
  },
});
