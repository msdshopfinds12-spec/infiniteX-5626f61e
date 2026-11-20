import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Phase 77 shell harness refuses every database except the named disposable fixture", async () => {
  const script = await read("../../scripts/test-phase-77-worker-state-machine.sh");
  assert.match(script, /PGDATABASE\s*!=\s*"infinitex_rehearsal"/);
  assert.match(script, /REFUSING: Phase 77 integration harness only runs against infinitex_rehearsal/);
  assert.match(script, /DELETE FROM auth\.users WHERE id = '\$OWNER'/);
});

test("Phase 77 creates synthetic tenant/workflow/run/step data only", async () => {
  const script = await read("../../scripts/test-phase-77-worker-state-machine.sh");
  for (const table of ["auth.users", "public.workflows", "public.workflow_steps", "public.workflow_runs", "public.workflow_step_runs"]) {
    assert.ok(script.includes(table), "missing fixture table " + table);
  }
  assert.match(script, /synthetic worker integration/i);
  assert.doesNotMatch(script, /curl\s|https:\/\/|supabase\.co/);
});

test("stale run and step generations cannot commit terminal state", async () => {
  const script = await read("../../scripts/test-phase-77-worker-state-machine.sh");
  assert.match(script, /WHERE id = '\$RUN' AND attempt = 1 RETURNING id/);
  assert.match(script, /WHERE run_id = '\$RUN' AND step_id = '\$STEP' AND attempt = 1 RETURNING id/);
  assert.match(script, /STALE_RUN_ROWS/);
  assert.match(script, /STALE_STEP_ROWS/);
  assert.match(script, /WHERE id = '\$RUN' AND attempt = 2 RETURNING id/);
  assert.match(script, /AND attempt = 2 RETURNING id/);
  assert.match(script, /PHASE 77 WORKER\/POSTGRES STATE-MACHINE INTEGRATION: PASS/);
});

test("workflow executes exact PostgreSQL replay, concurrency, stress, and security gates", async () => {
  const workflow = await read("../../.github/workflows/phase-77-worker-postgres-integration.yml");
  for (const marker of [
    "phase-77/worker-postgres-integration",
    "supabase/postgres:17.6.1.136",
    "scripts/rehearse-migration-chain.mjs",
    "scripts/test-workflow-claim-concurrency.sh",
    "scripts/test-workflow-claim-stress.sh",
    "scripts/test-phase-77-worker-state-machine.sh",
    "tests/database/phase-52-1b-postgres-security.sql",
    "docker rm -f infinitex-phase77-postgres",
  ]) assert.ok(workflow.includes(marker), "missing workflow gate " + marker);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
  assert.doesNotMatch(workflow, /SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD|VERCEL_TOKEN/);
});

test("shell harness is guarded against accidental production execution", async () => {
  const script = await read("../../scripts/test-phase-77-worker-state-machine.sh");
  assert.match(script, /PGHOST:\?\?/);
  assert.match(script, /PGDATABASE:\?\?/);
  assert.match(script, /PGUSER:\?\?/);
  assert.match(script, /trap cleanup EXIT/);
});
