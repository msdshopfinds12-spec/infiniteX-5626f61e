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
    const url = required("PHASE81_POSTGREST_URL");
    const serviceJwt = required("PHASE81_SERVICE_JWT");
    const userId = required("PHASE81_USER_ID");
    const admin = createClient(url, serviceJwt, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: { Authorization: "Bearer " + serviceJwt },
        fetch: postgrestFetch,
      },
    });

    const runId = "81000000-3000-4000-8000-000000000005";
    const stepId = "81000000-2000-4000-8000-000000000001";
    const workflowId = "81000000-1000-4000-8000-000000000001";
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
      p_idempotency_key: "phase87-disposable-notification-0001",
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
    const simulationRunId = "81000000-3000-4000-8000-000000000006";
    console.log("Phase 91: creating a separate synthetic event for non-delivery simulation");
    const { error: simulationRunError } = await admin.from("workflow_runs").insert({
      id: simulationRunId,
      workflow_id: workflowId,
      owner_id: userId,
      status: "running",
      input: { seed: "phase91-outbox-simulation" },
      attempt: 1,
    });
    assert(!simulationRunError, "simulation workflow run must be seeded: " + (simulationRunError?.message ?? ""));
    const { error: simulationStepError } = await admin.from("workflow_step_runs").insert({
      run_id: simulationRunId,
      step_id: stepId,
      owner_id: userId,
      status: "running",
      input: { seed: "phase91-outbox-simulation" },
      attempt: 1,
    });
    assert(!simulationStepError, "simulation step run must be seeded: " + (simulationStepError?.message ?? ""));

    const simulationCompletionArgs = {
      p_owner_id: userId,
      p_run_id: simulationRunId,
      p_step_id: stepId,
      p_attempt: 1,
      p_output: { simulated: true },
      p_event_type: "notification.requested",
      p_idempotency_key: "phase91-disposable-simulation-0001",
      p_payload: { recipient_ref: userId, template_key: "phase91-test" },
    };
    const { data: simulationCompletion, error: simulationCompletionError } = await admin.rpc(
      "simula_complete_step_with_outbox",
      simulationCompletionArgs,
    );
    assert(!simulationCompletionError && simulationCompletion?.length === 1,
      "simulation event must be created transactionally: " + (simulationCompletionError?.message ?? ""));
    const simulationOutboxId = simulationCompletion[0].outbox_id;
    const { data: simulationClaims, error: simulationClaimError } = await admin.rpc(
      "simula_claim_workflow_outbox",
      { p_limit: 5 },
    );
    assert(!simulationClaimError, "simulation event must be claimable");
    const simulationLease = (simulationClaims ?? []).find(
      (row: { id: string }) => row.id === simulationOutboxId,
    );
    assert(simulationLease, "simulation event must receive a lease");
    const simulationResult = {
      mode: "dry_run",
      delivery_attempted: false,
      event_type: "notification.requested",
      adapter: "notification-intent-preview-v1",
      outcome: "validated_not_delivered",
      idempotency_key: "phase91-disposable-simulation-0001",
    };
    const { data: simulated, error: simulationError } = await admin.rpc(
      "simula_record_workflow_outbox_simulation",
      {
        p_id: simulationOutboxId,
        p_lock_token: simulationLease.lock_token,
        p_result: simulationResult,
      },
    );
    assert(!simulationError && simulated?.[0]?.status === "simulated" && simulated[0].replayed === false,
      "current lease must record a distinct simulated non-delivery state: " + (simulationError?.message ?? ""));
    const { data: simulationReplay, error: simulationReplayError } = await admin.rpc(
      "simula_record_workflow_outbox_simulation",
      {
        p_id: simulationOutboxId,
        p_lock_token: simulationLease.lock_token,
        p_result: simulationResult,
      },
    );
    assert(!simulationReplayError && simulationReplay?.[0]?.status === "simulated" && simulationReplay[0].replayed === true,
      "identical simulation replay must be idempotent");
    const { error: simulationConflictError } = await admin.rpc(
      "simula_record_workflow_outbox_simulation",
      {
        p_id: simulationOutboxId,
        p_lock_token: simulationLease.lock_token,
        p_result: { ...simulationResult, outcome: "delivered" },
      },
    );
    assert(Boolean(simulationConflictError), "simulation replay with a different result must fail closed");
    const { data: afterSimulationClaims, error: afterSimulationClaimError } = await admin.rpc(
      "simula_claim_workflow_outbox",
      { p_limit: 5 },
    );
    assert(!afterSimulationClaimError, "post-simulation claim scan must succeed");
    assert(!(afterSimulationClaims ?? []).some((row: { id: string }) => row.id === simulationOutboxId),
      "simulated non-delivery event must not be claimable as pending work");

    console.log("Phase 91: transactional outbox integration verified");
  },
});
