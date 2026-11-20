import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("workflow enqueue remains explicitly disabled unless the operator opts in", async () => {
  const main = await read("src/main.tsx");
  assert.match(main, /VITE_WORKFLOW_RUN_ENQUEUE_ENABLED === "true"/);
  assert.match(main, /createWorkflowRunService\(supabaseResult\.client\)/);
  assert.match(main, /: null;/);
});

test("browser run service invokes only the authenticated enqueue Edge Function", async () => {
  const service = await read("src/features/workflows/workflow-run-service.ts");
  assert.match(service, /functions\.invoke<unknown>/);
  assert.match(service, /"simula-workflow-run-request"/);
  assert.match(service, /request_id:\s*requestId/);
  assert.doesNotMatch(service, /\.from\(/);
  assert.doesNotMatch(service, /simula-workflow-worker/);
});

test("queue UI preserves idempotency on retry and never reports worker execution as complete", async () => {
  const form = await read("src/features/workflows/workflow-run-queue-form.tsx");
  assert.match(form, /crypto\.randomUUID\(\)/);
  assert.match(form, /Retry same request/);
  assert.match(form, /requestId/);
  assert.match(form, /disabled=\{!service \|\| !isActive \|\| isSubmitting \|\| isRetryPending\}/);
  assert.match(form, /Worker execution is not yet confirmed/);
});

test("queue acceptance refreshes safe run history without exposing raw output", async () => {
  const list = await read("src/features/workflows/workflow-list.tsx");
  const history = await read("src/features/workflows/workflow-run-history.tsx");
  assert.match(list, /service=\{runService\}/);
  assert.match(list, /historyRefreshToken/);
  assert.match(list, /refreshToken=\{historyRefreshToken\}/);
  assert.match(history, /refreshToken\?: number/);
  assert.match(history, /refreshToken\]\)/);
  assert.match(history, /input, output and raw error text stay hidden/);
});

test("workspace explains the disabled-until-deployed gate and queued-versus-executed distinction", async () => {
  const app = await read("src/App.tsx");
  assert.match(app, /Queueing is disabled until the Phase 84 migration and Edge Function are explicitly deployed and verified/);
  assert.match(app, /a queued response does not prove worker execution/);
});
