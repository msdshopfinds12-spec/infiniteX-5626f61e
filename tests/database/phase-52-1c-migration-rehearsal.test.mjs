import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  classifyPsqlFailure,
  validateProvenance,
  validateReconstructedBaseline,
} from '../../scripts/rehearse-migration-chain.mjs';

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
  const appliedMigrations = Array.from({ length: 19 }, (_, index) => ({
    path: 'supabase/migrations/' + String(index + 1).padStart(14, '0') + '_base.sql',
  }));
  const candidatePath = 'supabase/migrations/00000000000020_candidate.sql';
  const manifest = { ledger_entry_count: 19, applied_migrations: appliedMigrations };
  const classification = {
    schemaVersion: 1,
    candidateMigrations: [{
      path: candidatePath,
      classification: 'PROPOSED_NOT_APPLIED',
      sourceStatus: 'NOT_VERIFIED_LIVE',
      productionApproval: 'NOT_GRANTED',
      sha256: 'a'.repeat(64),
    }],
  };
  const files = [...appliedMigrations.map((entry) => entry.path), candidatePath];
  assert.deepEqual(validateProvenance({ manifest, classification, files }), []);
  classification.candidateMigrations[0].path = appliedMigrations[0].path;
  assert.ok(validateProvenance({
    manifest,
    classification,
    files: appliedMigrations.map((entry) => entry.path),
  }).some((error) => error.includes('overlaps')));
});

test('reconstructed baseline is explicitly noncanonical and contains only five workflow objects', async () => {
  const provenance = JSON.parse(await readFile(new URL('../../docs/database/PHASE-52.1D-RECONSTRUCTED-BASELINE.json', import.meta.url), 'utf8'));
  const snapshot = JSON.parse(await readFile(new URL('../../docs/database/live-schema-metadata.snapshot.json', import.meta.url), 'utf8'));
  const sql = await readFile(new URL('./phase-52-1d-reconstructed-workflow-baseline.sql', import.meta.url), 'utf8');
  assert.deepEqual(validateReconstructedBaseline({ provenance, baselineSql: sql, snapshot }), []);
  assert.match(sql, /RECONSTRUCTED BASELINE.*DISPOSABLE TEST FIXTURE ONLY/);
  assert.doesNotMatch(sql, /^\s*scheduled_for\s+/im);
});

test('catalog assertion suite checks expected table, column, constraint, index, policy and RLS counts', async () => {
  const sql = await readFile(new URL('./phase-52-1d-assert-workflow-baseline.sql', import.meta.url), 'utf8');
  for (const marker of ['v_tables <> 5', 'v_columns <> 51', 'v_constraints <> 27', 'v_indexes <> 14', 'v_policies <> 6', 'NOT c.relrowsecurity']) {
    assert.ok(sql.includes(marker), 'missing assertion: ' + marker);
  }
});

test('platform bootstrap deliberately does not fabricate missing workflow application tables', async () => {
  const sql = await readFile(new URL('./phase-52-1c-platform-bootstrap.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS auth\.users/i);
  assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.(workflows|workflow_runs|workflow_steps|workflow_step_runs|workflow_logs)/i);
});
