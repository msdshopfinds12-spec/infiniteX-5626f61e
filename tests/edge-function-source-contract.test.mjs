import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("authenticated workflow worker retains its request and tenant boundaries", async () => {
  const code = await source("../supabase/functions/simula-workflow-worker/index.ts");

  assert.match(code, /corsHeadersForRequest\(req\)/);
  assert.match(code, /if \(!cors\.allowed\)/);
  assert.match(code, /auth\.getUser\(token\)/);
  assert.match(code, /readJsonBodyLimited\(req, 2048\)/);
  assert.match(code, /simula_claim_workflow_runs/);
  assert.match(code, /\.eq\("owner_id", ownerId\)/);
  assert.match(code, /\.eq\("attempt", run\.attempt\)/);
  assert.match(code, /workflow_run_attempt_superseded/);
});

test("cron worker requires a verified server secret and generation-fenced writes", async () => {
  const code = await source("../supabase/functions/simula-workflow-cron-worker/index.ts");

  assert.match(code, /x-simula-worker-secret/);
  assert.match(code, /suppliedSecret\.length < 32/);
  assert.match(code, /simula_verify_worker_secret/);
  assert.match(code, /simula_claim_workflow_runs_internal/);
  assert.match(code, /readJsonBodyLimited\(req, 2048\)/);
  assert.match(code, /\.eq\("attempt", run\.attempt\)/);
  assert.match(code, /workflow_run_attempt_superseded/);
});

test("API-key manager authenticates callers and stores only a digest", async () => {
  const code = await source("../supabase/functions/ashaa-api-key-manager/index.ts");

  assert.match(code, /authClient\.auth\.getUser\(bearer\)/);
  assert.match(code, /readJsonBodyLimited\(req, 2048\)/);
  assert.match(code, /key_hash: digest/);
  assert.match(code, /return response\(req, 201, \{ ok: true, key: rawKey/);
  assert.doesNotMatch(code, /select\([^\n]*key_hash/);
});

test("all server-side handlers use the shared exact-origin CORS policy where browser access is supported", async () => {
  const apiKeys = await source("../supabase/functions/ashaa-api-key-manager/index.ts");
  const userWorker = await source("../supabase/functions/simula-workflow-worker/index.ts");
  const cronWorker = await source("../supabase/functions/simula-workflow-cron-worker/index.ts");

  assert.match(apiKeys, /corsHeadersForRequest\(req\)/);
  assert.match(userWorker, /corsHeadersForRequest\(req\)/);
  // Cron worker is a server-to-server endpoint authenticated by a stored secret;
  // it intentionally does not expose browser CORS headers.
  assert.match(cronWorker, /x-simula-worker-secret/);
  assert.doesNotMatch(cronWorker, /Access-Control-Allow-Origin/);
});
