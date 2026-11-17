import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const worker = read("../../supabase/functions/simula-workflow-worker/index.ts");
const cron = read("../../supabase/functions/simula-workflow-cron-worker/index.ts");
const keyManager = read("../../supabase/functions/ashaa-api-key-manager/index.ts");
const cors = read("../../supabase/functions/_shared/cors.ts");
const workerSecurity = read("../../supabase/functions/_shared/worker-security.mjs");

assert.match(worker, /corsHeadersForRequest/);
assert.match(worker, /if \(!cors\.allowed\)/);
assert.match(worker, /isClaimedRunOwnedBy\(run, ownerId\)/);
assert.match(worker, /isWorkflowOwnedBy\(workflow, run\.workflow_id, ownerId\)/);
assert.match(worker, /readJsonBodyLimited\(req, 2048\)/);
assert.doesNotMatch(worker, /Access-Control-Allow-Origin["']?\s*:\s*["']\*["']/);

assert.match(keyManager, /corsHeadersForRequest/);
assert.match(keyManager, /if \(!cors\.allowed\)/);
assert.match(keyManager, /readJsonBodyLimited\(req, 2048\)/);
assert.doesNotMatch(keyManager, /Access-Control-Allow-Origin["']?\s*:\s*["']\*["']/);

assert.match(cron, /simula_verify_worker_secret/);
assert.match(cron, /claimed_run_invalid/);
assert.match(cron, /isClaimedRunValid\(run\)/);
assert.match(cron, /isWorkflowOwnedBy\(workflow, run\.workflow_id, ownerId\)/);
assert.match(cron, /readJsonBodyLimited\(req, 2048\)/);
assert.match(cron, /\.eq\("owner_id", ownerId\)/);

assert.match(cors, /INFINITEX_ALLOWED_ORIGINS/);
assert.match(cors, /allowedOrigins\.has\(origin\)/);
assert.doesNotMatch(cors, /Access-Control-Allow-Origin["']?\s*:\s*["']\*["']/);

assert.match(workerSecurity, /export function isClaimedRunOwnedBy/);
assert.match(workerSecurity, /export function isWorkflowOwnedBy/);
assert.match(workerSecurity, /export async function readJsonBodyLimited/);

console.log("Edge Function security source checks passed.");
