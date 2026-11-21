import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const completionPath = "../../supabase/functions/_shared/workflow-completion.ts";

test("authenticated worker uses bounded input and exact-origin policy", async () => {
  const source = await read("../../supabase/functions/simula-workflow-worker/index.ts");
  assert.match(source, /corsHeadersForRequest/);
  assert.match(source, /if \(!cors\.allowed\)/);
  assert.match(source, /readJsonBodyLimited\(req,\s*2048\)/);
  assert.match(source, /authenticateBearerRequest/);
  assert.doesNotMatch(source, /\.upsert\(/);
});

test("cron worker authenticates the shared secret before bounded global lease claims", async () => {
  const source = await read("../../supabase/functions/simula-workflow-cron-worker/index.ts");
  assert.ok(source.includes("authenticateCronRequest"));
  assert.ok(source.includes("readJsonBodyLimited(req, 2048)"));
  assert.ok(source.includes("claimCronWorkflowLeases("));
  assert.ok(!source.includes("simula_claim_workflow_runs_internal"));
  assert.ok(!source.includes(".upsert("));
});

test("authenticated worker delegates every lifecycle transition to fenced lease RPCs", async () => {
  const source = await read("../../supabase/functions/simula-workflow-worker/index.ts");
  const rpc = await read("../../supabase/functions/_shared/workflow-lease-rpc.ts");
  const contract = await read("../../supabase/functions/_shared/workflow-lease-contract.ts");
  const supervisor = await read("../../supabase/functions/_shared/workflow-lease-supervisor.ts");
  for (const token of [
    "claimWorkflowLeases(", "heartbeatWorkflowLease(", "startWorkflowStepWithLease(",
    "failWorkflowStepWithLease(", "completeWorkflowStepWithLease(", "finishWorkflowRunWithLease(",
  ]) assert.ok(source.includes(token), "missing fenced transition: " + token);
  assert.doesNotMatch(source, /\.from\(["']workflow_step_runs["']\)\.(insert|update|upsert)\(/);
  assert.doesNotMatch(source, /\.from\(["']workflow_runs["']\)\.(update|upsert)\(/);
  assert.doesNotMatch(source, /simula_claim_workflow_runs["']/);
  assert.doesNotMatch(source, /completeWorkflowStepWithOutbox\(/);
  assert.match(source, /supervisor\.signal\.aborted/);
  assert.match(source, /abortableSleep/);
  assert.match(source, /createWorkflowStepCompletedEvent/);
  assert.match(contract, /claim: "simula_claim_workflow_runs_lease_internal"/);
  assert.match(contract, /startStep: "simula_start_workflow_step_with_lease"/);
  assert.match(contract, /failStep: "simula_fail_workflow_step_with_lease"/);
  assert.match(contract, /completeStep: "simula_complete_step_with_outbox_lease"/);
  assert.match(contract, /finishRun: "simula_finish_workflow_run_lease"/);
  assert.match(rpc, /LEASE_RPC\.claim/);
  assert.match(supervisor, /heartbeatTimeoutMs/);
  assert.match(supervisor, /Promise\.race/);
});

test("cron worker delegates every lifecycle transition to fenced lease RPCs", async () => {
  const source = await read("../../supabase/functions/simula-workflow-cron-worker/index.ts");
  const rpc = await read("../../supabase/functions/_shared/workflow-lease-rpc.ts");
  const supervisor = await read("../../supabase/functions/_shared/workflow-lease-supervisor.ts");
  for (const token of [
    "claimCronWorkflowLeases(", "heartbeatWorkflowLease(", "startWorkflowStepWithLease(",
    "failWorkflowStepWithLease(", "completeWorkflowStepWithLease(", "finishWorkflowRunWithLease(",
  ]) assert.ok(source.includes(token), "missing cron fenced transition: " + token);
  for (const table of ["workflow_step_runs", "workflow_runs"]) {
    for (const method of ["insert", "update", "upsert"]) {
      assert.ok(!source.includes('.from("' + table + '").' + method + '('),
        "direct state mutation remains for " + table + "." + method);
    }
  }
  assert.ok(!source.includes("simula_claim_workflow_runs_internal"));
  assert.ok(!source.includes("completeWorkflowStepWithOutbox("));
  assert.ok(source.includes("const ownerId = lease.ownerId"));
  assert.ok(source.includes("supervisor.signal.aborted"));
  assert.ok(source.includes("abortableSleep"));
  assert.ok(source.includes("createWorkflowStepCompletedEvent"));
  assert.ok(rpc.includes("claimCronWorkflowLeases"));
  assert.ok(supervisor.includes("heartbeatTimeoutMs"));
  assert.ok(supervisor.includes("Promise.race"));
});

test("API-key manager rejects wildcard CORS and uses streamed JSON size limits", async () => {
  const source = await read("../../supabase/functions/ashaa-api-key-manager/index.ts");
  assert.match(source, /corsHeadersForRequest/);
  assert.match(source, /cors\.allowed/);
  assert.match(source, /readJsonBodyLimited\(req,\s*2048\)/);
  assert.doesNotMatch(source, /Access-Control-Allow-Origin["']?\s*:\s*["']\*["']/);
  assert.doesNotMatch(source, /await\s+req\.json\(\)/);
});

test("shared CORS adapter is exact-match and fails closed for unconfigured browser origins", async () => {
  const source = await read("../../supabase/functions/_shared/cors.ts");
  assert.match(source, /allowedOrigins\.has\(origin\)/);
  assert.match(source, /INFINITEX_ALLOWED_ORIGINS/);
  assert.match(source, /allowed = !origin \|\| allowedOrigins\.has\(origin\)/);
  assert.doesNotMatch(source, /Access-Control-Allow-Origin["']?\s*:\s*["']\*["']/);
});

test("shared body parser enforces actual streamed bytes and rejects invalid UTF-8", async () => {
  const source = await read("../../supabase/functions/_shared/worker-security.mjs");
  assert.match(source, /request\.body\.getReader\(\)/);
  assert.match(source, /total \+= value\.byteLength/);
  assert.match(source, /total > maxBytes/);
  assert.match(source, /new TextDecoder\(["']utf-8["'],\s*\{\s*fatal:\s*true\s*\}\)/);
});
