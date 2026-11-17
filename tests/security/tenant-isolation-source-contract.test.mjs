import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const authenticatedWorker = await readFile(
  new URL("../../supabase/functions/simula-workflow-worker/index.ts", import.meta.url),
  "utf8",
);
const cronWorker = await readFile(
  new URL("../../supabase/functions/simula-workflow-cron-worker/index.ts", import.meta.url),
  "utf8",
);

test("authenticated worker derives the tenant from a verified Supabase session", () => {
  assert.match(authenticatedWorker, /auth\.getUser\(token\)/);
  assert.match(authenticatedWorker, /const ownerId = userData\.user\.id/);
  assert.match(authenticatedWorker, /isClaimedRunOwnedBy\(run, ownerId\)/);
});

test("authenticated worker validates the parent workflow against both IDs", () => {
  assert.match(
    authenticatedWorker,
    /\.from\("workflows"\)[\s\S]{0,350}?\.eq\("id", run\.workflow_id\)[\s\S]{0,100}?\.eq\("owner_id", ownerId\)/,
  );
  assert.match(
    authenticatedWorker,
    /isWorkflowOwnedBy\(workflow, run\.workflow_id, ownerId\)/,
  );
});

test("authenticated worker scopes step-run reads to the same owner", () => {
  assert.match(
    authenticatedWorker,
    /\.eq\("run_id", run\.id\)[\s\S]{0,100}?\.eq\("step_id", step\.id\)[\s\S]{0,100}?\.eq\("owner_id", ownerId\)/,
  );
});

test("cron worker verifies its server secret before claiming the internal queue", () => {
  const verifyIndex = cronWorker.indexOf('"simula_verify_worker_secret"');
  const claimIndex = cronWorker.indexOf('"simula_claim_workflow_runs_internal"');
  assert.notEqual(verifyIndex, -1, "secret verification RPC must exist");
  assert.notEqual(claimIndex, -1, "internal claim RPC must exist");
  assert.ok(verifyIndex < claimIndex, "secret must be verified before queue claim");
});

test("cron worker rejects malformed claims and validates the parent owner", () => {
  assert.match(cronWorker, /isClaimedRunValid\(run\)/);
  assert.match(cronWorker, /const ownerId = run\.owner_id/);
  assert.match(
    cronWorker,
    /\.from\("workflows"\)[\s\S]{0,350}?\.eq\("id", run\.workflow_id\)[\s\S]{0,100}?\.eq\("owner_id", ownerId\)/,
  );
  assert.match(cronWorker, /isWorkflowOwnedBy\(workflow, run\.workflow_id, ownerId\)/);
});

test("cron worker scopes step-run reads to the claimed run owner", () => {
  assert.match(
    cronWorker,
    /\.eq\("run_id", run\.id\)[\s\S]{0,100}?\.eq\("step_id", step\.id\)[\s\S]{0,100}?\.eq\("owner_id", ownerId\)/,
  );
});
