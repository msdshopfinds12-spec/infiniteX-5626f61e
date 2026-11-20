import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classifyPsqlFailure, validateProvenance } from '../../scripts/rehearse-migration-chain.mjs';

test('missing application baseline is BLOCKED, not misreported as a migration syntax defect', () => {
  assert.equal(classifyPsqlFailure('ERROR: relation "public.workflow_runs" does not exist'), 'BLOCKED');
});

test('missing Supabase extension or preload is BLOCKED pending compatible disposable infrastructure', () => {
  assert.equal(classifyPsqlFailure('ERROR: extension "pg_cron" is not available'), 'BLOCKED');
  assert.equal(classifyPsqlFailure('pg_cron must be loaded via shared_preload_libraries'), 'BLOCKED');
});

test('unexpected SQL execution errors remain FAIL', () => {
  assert.equal(classifyPsqlFailure('ERROR: syntax error at or near "BROKEN"'), 'FAIL');
  assert.equal(classifyPsqlFailure('ERROR: duplicate key value violates unique constraint'), 'FAIL');
});

test('candidate migration cannot be represented as part of recovered applied history', () => {
  const manifest = { ledger_entry_count: 19, applied_migrations: [{ path: 'supabase/migrations/001_base.sql' }] };
  const classification = { schemaVersion: 1, candidateMigrations: [{ path: 'supabase/migrations/002_candidate.sql' }] };
  assert.deepEqual(validateProvenance({
    manifest,
    classification,
    files: ['supabase/migrations/001_base.sql', 'supabase/migrations/002_candidate.sql'],
  }), []);
  classification.candidateMigrations[0].path = 'supabase/migrations/001_base.sql';
  assert.ok(validateProvenance({
    manifest,
    classification,
    files: ['supabase/migrations/001_base.sql'],
  }).some((error) => error.includes('overlaps')));
});

test('platform bootstrap deliberately does not fabricate missing workflow application tables', async () => {
  const sql = await readFile(new URL('./phase-52-1c-platform-bootstrap.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS auth\.users/i);
  assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.(workflows|workflow_runs|workflow_steps|workflow_step_runs|workflow_logs)/i);
});
