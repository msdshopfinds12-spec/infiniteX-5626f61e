import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const authenticatedWorker = read("../../supabase/functions/simula-workflow-worker/index.ts");
const cronWorker = read("../../supabase/functions/simula-workflow-cron-worker/index.ts");
const authBoundary = read("../../supabase/functions/_shared/worker-auth-boundary.mjs");
const sharedActions = read("../../supabase/functions/_shared/workflow-actions.mjs");
const sharedCompletion = read("../../supabase/functions/_shared/workflow-completion.ts");

function assertOrdered(source, first, second, message) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert.notEqual(firstIndex, -1, `missing first contract token: ${first}`);
  assert.notEqual(secondIndex, -1, `missing second contract token: ${second}`);
  assert.ok(firstIndex < secondIndex, message);
}

test("both worker adapters use the same safe action and bounded retry runtime", () => {
  for (const [name, source] of [["authenticated", authenticatedWorker], ["cron", cronWorker]]) {
    assert.match(source, /executeSafeAction/);
    assert.match(source, /executeWithRetry/);
    assert.match(source, /executeWithinStepBudget/);
    assert.match(source, /isAttemptGenerationNewer/);
    assert.match(source, /completeWorkflowStepWithOutbox/, `${name} worker must use shared completion`);
    assert.match(source, /Deno\\.serve\\(/, `${name} worker must expose a Deno handler`);
  }
  for (const action of ["pass_through","set_value","merge_json","uppercase_text","lowercase_text","append_text","prepend_text"]) {
    assert.ok(sharedActions.includes(action), `shared action missing: ${action}`);
  }
});

test("authenticated adapter verifies bearer identity before user-scoped queue claim", () => {
  assert.match(authBoundary, /Authorization/);
  assert.match(authBoundary, /Bearer\\s/);
  assert.match(authBoundary, /userClient\\.auth\\.getUser\\(token\\)/);
  assertOrdered(authBoundary, "userClient.auth.getUser(token)", "return { ok: true, userClient",
    "authenticated boundary must verify identity before returning the user client");
  assert.match(authenticatedWorker, /deps\\.authenticateBearerRequest \\?\\? authenticateBearerRequest/);
  assert.match(authenticatedWorker, /isClaimedRunOwnedBy\\(run, ownerId\\)/);
  assertOrdered(authenticatedWorker, "await authenticate({", 'userClient.rpc(\\n    "simula_claim_workflow_runs"',
    "authenticated queue claim must only be reachable after identity verification");
});

test("cron adapter verifies secret before privileged queue claim", () => {
  assert.match(authBoundary, /x-simula-worker-secret/);
  assert.match(authBoundary, /secret\\.length < 32/);
  assert.match(authBoundary, /simula_verify_worker_secret/);
  assertOrdered(authBoundary, 'admin.rpc("simula_verify_worker_secret"', "return { ok: true, admin",
    "cron boundary must verify its secret before exposing the privileged client");
  assert.match(cronWorker, /simula_claim_workflow_runs_internal/);
  assertOrdered(cronWorker, "authenticateCronRequest({", "simula_claim_workflow_runs_internal",
    "cron worker must verify its secret before claiming privileged queue rows");
  assert.match(cronWorker, /isClaimedRunValid\\(run\\)/);
});

test("both adapters fence state writes by owner and attempt generation", () => {
  for (const [name, source] of [["authenticated", authenticatedWorker], ["cron", cronWorker]]) {
    assert.match(source, /\\.lt\\("attempt", stepAttempt\\)/, `${name} adapter must use monotonic step-run CAS`);
    assert.match(source, /completeWorkflowStepWithOutbox/, `${name} adapter must use shared transactional completion`);
    assert.match(source, /\\.eq\\("attempt", run\\.attempt\\)/, `${name} adapter must fence terminal workflow writes`);
    assert.match(source, /\\.eq\\("owner_id", ownerId\\)/, `${name} adapter must scope writes to owner`);
    assert.match(source, /attempt_generation_changed/);
  }
});

test("shared completion helper owns the fixed RPC and strict result validation", () => {
  assert.match(sharedCompletion, /simula_complete_step_with_outbox/);
  assert.match(sharedCompletion, /p_attempt:\\s*input\\.attempt/);
  assert.match(sharedCompletion, /typeof row\\.step_run_id === "string"/);
  assert.match(sharedCompletion, /step_run_finish_failed/);
  assert.match(sharedCompletion, /workflow_step_attempt_superseded/);
});

test("both adapters treat a lost workflow terminal compare-and-set as superseded", () => {
  for (const [name, source] of [["authenticated", authenticatedWorker], ["cron", cronWorker]]) {
    assert.match(source, /if \\(!finishedRun\\) throw new Error\\("workflow_run_attempt_superseded"\\)/);
    assert.match(source, /status:\\s*"superseded"/);
    assert.ok(source.includes("superseded"), `${name} adapter must report superseded work`);
  }
});
