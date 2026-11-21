import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const authenticatedWorker = read("../../supabase/functions/simula-workflow-worker/index.ts");
const cronWorker = read("../../supabase/functions/simula-workflow-cron-worker/index.ts");
const authBoundary = read("../../supabase/functions/_shared/worker-auth-boundary.mjs");
const sharedActions = read("../../supabase/functions/_shared/workflow-actions.mjs");
const sharedCompletion = read("../../supabase/functions/_shared/workflow-completion.ts");
const leaseRpc = read("../../supabase/functions/_shared/workflow-lease-rpc.ts");
const leaseContract = read("../../supabase/functions/_shared/workflow-lease-contract.ts");
const leaseSupervisor = read("../../supabase/functions/_shared/workflow-lease-supervisor.ts");

function assertOrdered(source, first, second, message) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert.notEqual(firstIndex, -1, `missing first contract token: ${first}`);
  assert.notEqual(secondIndex, -1, `missing second contract token: ${second}`);
  assert.ok(firstIndex < secondIndex, message);
}

test("both worker adapters use the same safe action and bounded retry runtime", () => {
  for (const [name, source] of [["authenticated", authenticatedWorker], ["cron", cronWorker]]) {
    assert.ok(source.includes("executeSafeAction"));
    assert.ok(source.includes("executeWithRetry"));
    assert.ok(source.includes("executeWithinStepBudget"));
    assert.ok(source.includes("Deno.serve("), `${name} worker must expose a Deno handler`);
  }
  assert.ok(authenticatedWorker.includes("completeWorkflowStepWithLease("));
  assert.ok(cronWorker.includes("completeWorkflowStepWithOutbox("));
  for (const action of ["pass_through","set_value","merge_json","uppercase_text","lowercase_text","append_text","prepend_text"]) {
    assert.ok(sharedActions.includes(action), `shared action missing: ${action}`);
  }
});

test("authenticated adapter verifies bearer identity before service-role lease claim", () => {
  assert.ok(authBoundary.includes("Authorization"));
  assert.ok(authBoundary.includes("userClient.auth.getUser(token)"));
  assertOrdered(authBoundary, "userClient.auth.getUser(token)", "return { ok: true, userClient",
    "authenticated boundary must verify identity before returning verified owner identity");
  assert.ok(authenticatedWorker.includes("deps.authenticateBearerRequest ?? authenticateBearerRequest"));
  assert.ok(authenticatedWorker.includes("claimWorkflowLeases(rpc, { ownerId, limit, leaseSeconds: 90 })"));
  assertOrdered(authenticatedWorker, "await authenticate({", "createClient(supabaseUrl, serviceRoleKey",
    "service-role client must only be constructed after bearer authentication");
  assert.ok(!authenticatedWorker.includes('"simula_claim_workflow_runs"'), "legacy user-scoped claim must be absent");
});

test("authenticated worker uses only fenced lifecycle RPCs and has no direct lifecycle writes", () => {
  for (const rpc of [
    "claimWorkflowLeases(", "heartbeatWorkflowLease(", "startWorkflowStepWithLease(",
    "failWorkflowStepWithLease(", "completeWorkflowStepWithLease(", "finishWorkflowRunWithLease(",
  ]) assert.ok(authenticatedWorker.includes(rpc), `missing lease RPC adapter: ${rpc}`);
  assert.ok(!authenticatedWorker.includes('.from("workflow_step_runs").insert('));
  assert.ok(!authenticatedWorker.includes('.from("workflow_step_runs").update('));
  assert.ok(!authenticatedWorker.includes('.from("workflow_runs").update('));
  assert.ok(!authenticatedWorker.includes("completeWorkflowStepWithOutbox("));
  assert.ok(authenticatedWorker.includes("supervisor.signal.aborted"));
  assert.ok(authenticatedWorker.includes("abortableSleep"));
  assert.ok(authenticatedWorker.includes("createWorkflowStepCompletedEvent"));
  assert.ok(authenticatedWorker.includes("await supervisor.release()"));
});

test("lease adapter and supervisor fail closed on ambiguous transport and enforce heartbeat bounds", () => {
  assert.ok(leaseRpc.includes("LEASE_TRANSPORT_AMBIGUOUS"));
  assert.ok(leaseContract.includes('claim: "simula_claim_workflow_runs_lease_internal"'));
  assert.ok(leaseContract.includes('startStep: "simula_start_workflow_step_with_lease"'));
  assert.ok(leaseContract.includes('failStep: "simula_fail_workflow_step_with_lease"'));
  assert.ok(leaseContract.includes('completeStep: "simula_complete_step_with_outbox_lease"'));
  assert.ok(leaseContract.includes('finishRun: "simula_finish_workflow_run_lease"'));
  assert.ok(leaseSupervisor.includes("heartbeatTimeoutMs"));
  assert.ok(leaseSupervisor.includes("Promise.race"));
  assert.ok(leaseSupervisor.includes("this.#controller.abort(error)"));
});

test("cron adapter retains authenticated secret boundary and legacy lifecycle until its own migration", () => {
  assert.ok(authBoundary.includes("x-simula-worker-secret"));
  assert.ok(authBoundary.includes("secret.length < 32"));
  assert.ok(authBoundary.includes("simula_verify_worker_secret"));
  assertOrdered(authBoundary, 'admin.rpc("simula_verify_worker_secret"', "return { ok: true, admin",
    "cron boundary must verify secret before exposing privileged client");
  assert.ok(cronWorker.includes("simula_claim_workflow_runs_internal"));
  assertOrdered(cronWorker, "authenticateCronRequest({", "simula_claim_workflow_runs_internal",
    "cron worker must verify its secret before claiming privileged queue rows");
  assert.ok(cronWorker.includes("isClaimedRunValid(run)"));
  assert.ok(cronWorker.includes("completeWorkflowStepWithOutbox("));
});

test("shared legacy completion helper remains strict while cron migration is pending", () => {
  assert.ok(sharedCompletion.includes('"simula_complete_step_with_outbox"'));
  assert.ok(sharedCompletion.includes("p_attempt: input.attempt"));
  assert.ok(sharedCompletion.includes("!isCanonicalUuid(row.step_run_id)"));
  assert.ok(sharedCompletion.includes("row.outbox_id === null || isCanonicalUuid(row.outbox_id)"));
  assert.ok(sharedCompletion.includes('typeof row.replayed !== "boolean"'));
  assert.ok(sharedCompletion.includes("POSTGRES_INTEGER_MAX"));
});
