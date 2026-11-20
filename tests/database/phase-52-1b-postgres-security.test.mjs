import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const harnessUrl = new URL('./phase-52-1b-postgres-security.sql', import.meta.url);
const workflowUrl = new URL('../../.github/workflows/database-contract.yml', import.meta.url);

test('PostgreSQL behavior harness applies the exact reviewed migrations in disposable scope', async () => {
  const sql = await readFile(harnessUrl, 'utf8');
  for (const migration of [
    '20261025201831_simula_secure_workflow_run_claiming.sql',
    '20261025201906_simula_move_claim_definer_to_private_schema.sql',
    '20261025201915_simula_allow_authenticated_claim_wrapper_access.sql',
    '20261025202606_simula_internal_worker_queue_claiming.sql',
    '20261103134251_ashaa_backend_api_keys_and_webhook_idempotency.sql',
    '20261120120000_harden_platform_api_key_column_access.sql',
  ]) {
    assert.ok(sql.includes(migration), 'missing migration from disposable behavior test: ' + migration);
  }
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^ROLLBACK;/m);
  assert.match(sql, /CREATE ROLE authenticated NOLOGIN/);
  assert.match(sql, /CREATE ROLE service_role NOLOGIN BYPASSRLS/);
});

test('behavior harness covers tenant isolation, secret columns, webhook grants, and privileged functions', async () => {
  const sql = await readFile(harnessUrl, 'utf8');
  for (const token of [
    'has_column_privilege',
    'key_hash',
    'revoked_at',
    'billing_webhook_events',
    'simula_claim_workflow_runs',
    'simula_claim_workflow_runs_internal',
    'SECURITY DEFINER',
    'workflow claim crossed tenant boundary',
    'user B modified user A API key',
    'search_path=""',
  ]) {
    assert.ok(sql.includes(token), 'missing security assertion: ' + token);
  }
});

test('CI executes behavior suite only against its disposable PostgreSQL service', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  assert.match(workflow, /postgresql-security-behavior/);
  assert.match(workflow, /postgres:17/);
  assert.match(workflow, /phase-52-1b-postgres-security\.sql/);
  assert.match(workflow, /PGDATABASE: infinitex_security_test/);
});
