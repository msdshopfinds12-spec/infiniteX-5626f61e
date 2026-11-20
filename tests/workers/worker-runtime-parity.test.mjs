import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("authenticated worker uses bounded input and exact-origin policy", async () => {
  const source = await read("../../supabase/functions/simula-workflow-worker/index.ts");
  assert.match(source, /corsHeadersForRequest/);
  assert.match(source, /if \(!cors\.allowed\)/);
  assert.match(source, /readJsonBodyLimited\(req,\s*2048\)/);
  assert.match(source, /authenticateBearerRequest/);
  assert.doesNotMatch(source, /\.upsert\(/);
});

test("cron worker authenticates the shared secret and bounds streamed JSON", async () => {
  const source = await read("../../supabase/functions/simula-workflow-cron-worker/index.ts");
  assert.match(source, /authenticateCronRequest/);
  assert.match(source, /readJsonBodyLimited\(req,\s*2048\)/);
  assert.match(source, /simula_claim_workflow_runs_internal/);
  assert.doesNotMatch(source, /\.upsert\(/);
});

for (const [name, path] of [
  ["authenticated", "../../supabase/functions/simula-workflow-worker/index.ts"],
  ["cron", "../../supabase/functions/simula-workflow-cron-worker/index.ts"],
]) {
  test(name + " worker protects every step/run update with attempt-generation compare-and-set", async () => {
    const source = await read(path);
    const updates = (source.match(/\.update\(/g) ?? []).length;
    const olderGenerationGuards = (source.match(/\.lt\(["']attempt["'],\s*stepAttempt\)/g) ?? []).length;
    const stepGenerationGuards = (source.match(/\.eq\(["']attempt["'],\s*stepAttempt\)/g) ?? []).length;
    const runGenerationGuards = (source.match(/\.eq\(["']attempt["'],\s*run\.attempt\)/g) ?? []).length;

    assert.ok(updates >= 6, "expected explicit state updates, not blind upserts");
    assert.equal(olderGenerationGuards, 2, "both step-start paths must reject equal/newer stored generations");
    assert.ok(stepGenerationGuards >= 2, "step completion/failure must match the claimed generation");
    assert.ok(runGenerationGuards >= 2, "run completion/failure must match the claimed generation");
    assert.match(source, /workflow_step_attempt_superseded/);
    assert.match(source, /workflow_run_attempt_superseded/);
    assert.match(source, /status:\s*"superseded"/);
    assert.doesNotMatch(source, /\.upsert\(/);
  });
}

test("API-key manager rejects wildcard CORS and uses streamed JSON size limits", async () => {
  const source = await read("../../supabase/functions/ashaa-api-key-manager/index.ts");
  assert.match(source, /corsHeadersForRequest/);
  assert.match(source, /cors\.allowed/);
  assert.match(source, /readJsonBodyLimited\(req,\s*4096\)/);
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
