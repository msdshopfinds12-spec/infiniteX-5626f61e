import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("workflow history polls only server-reported active states", async () => {
  const policy = await read("src/features/workflows/workflow-run-polling.ts");
  assert.match(policy, /ACTIVE_RUN_STATUSES = new Set\(\["queued", "running"\]\)/);
  assert.match(policy, /WORKFLOW_RUN_POLL_INTERVAL_MS = 5_000/);
  assert.match(policy, /runs\.some/);
});

test("workflow history polling pauses in hidden tabs and cleans up timers/listeners", async () => {
  const history = await read("src/features/workflows/workflow-run-history.tsx");
  assert.match(history, /document\.visibilityState !== "visible"/);
  assert.match(history, /addEventListener\("visibilitychange"/);
  assert.match(history, /removeEventListener\("visibilitychange"/);
  assert.match(history, /window\.clearTimeout/);
  assert.match(history, /disposed = true/);
});

test("workflow history retains manual refresh and never invokes worker or mutates run state", async () => {
  const history = await read("src/features/workflows/workflow-run-history.tsx");
  assert.match(history, /Refresh now/);
  assert.match(history, /service\.listWorkflowRuns/);
  assert.doesNotMatch(history, /functions\.invoke|simula-workflow-worker|\.update\(|\.insert\(/);
});

test("workflow status UI describes polling without claiming queued means completed", async () => {
  const history = await read("src/features/workflows/workflow-run-history.tsx");
  const queue = await read("src/features/workflows/workflow-run-queue-form.tsx");
  assert.match(history, /Live status refresh/);
  assert.match(history, /Run history is up to date/);
  assert.match(queue, /Worker execution is not yet confirmed/);
});
