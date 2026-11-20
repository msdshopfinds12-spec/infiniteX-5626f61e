import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const validator = fileURLToPath(new URL('../../scripts/check-database-contract.mjs', import.meta.url));
async function runValidator(t, snapshotText) {
  const cwd = await mkdtemp(path.join(tmpdir(), 'infinitex-contract-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  if (snapshotText !== undefined) {
    const dir = path.join(cwd, 'supabase', 'contracts');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'database-contract.snapshot.json'), snapshotText, 'utf8');
  }
  return spawnSync(process.execPath, [validator], { cwd, encoding: 'utf8' });
}
const validSnapshot = {
  schemaVersion: 1, capturedAt: '2026-11-20T00:00:00.000Z', source: 'sanitized test fixture',
  reviewStatus: 'APPROVED',
  review: { reviewedBy: 'independent-reviewer', reviewedAt: '2026-11-20T00:00:00.000Z', reviewEvidence: 'synthetic test fixture approval' },
  tables: [{ schema: 'public', name: 'profiles', rlsEnabled: true, policies: [] }],
  functions: [{ schema: 'public', name: 'get_profile', identityArguments: 'user_id uuid', securityDefiner: false, executeRoles: ['authenticated'] }],
};
test('missing snapshot fails closed with exit code 2', async (t) => {
  const result = await runValidator(t);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /BLOCKED: database-contract\.snapshot\.json is not present/);
});
test('pending human review is blocked with exit code 2', async (t) => {
  const result = await runValidator(t, JSON.stringify({ ...validSnapshot, reviewStatus: 'PENDING_HUMAN_REVIEW' }));
  assert.equal(result.status, 2);
  assert.match(result.stderr, /explicit human approval/);
});
test('approved snapshot passes structural validation', async (t) => {
  const result = await runValidator(t, JSON.stringify(validSnapshot));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /structure valid: 1 table\(s\), 1 function overload\(s\)/);
});
test('approved snapshot requires reviewer identity, time, and evidence', async (t) => {
  const result = await runValidator(t, JSON.stringify({ ...validSnapshot, review: { reviewedBy: '', reviewedAt: null, reviewEvidence: '' } }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /APPROVED snapshot requires review/);
});
test('non-object JSON root returns a validation error, not a crash', async (t) => {
  const result = await runValidator(t, 'null');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /root must be a JSON object/);
});
test('non-array tables and functions return validation errors, not TypeErrors', async (t) => {
  const result = await runValidator(t, JSON.stringify({ ...validSnapshot, tables: {}, functions: {} }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /tables must be an array/);
  assert.match(result.stderr, /functions must be an array/);
  assert.doesNotMatch(result.stderr, /TypeError/);
});
test('null table and function entries are reported safely', async (t) => {
  const result = await runValidator(t, JSON.stringify({ ...validSnapshot, tables: [null], functions: [null] }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /tables\[0\] must be a JSON object/);
  assert.match(result.stderr, /functions\[0\] must be a JSON object/);
  assert.doesNotMatch(result.stderr, /TypeError/);
});
test('duplicate table and function identities are rejected', async (t) => {
  const result = await runValidator(t, JSON.stringify({ ...validSnapshot, tables: [...validSnapshot.tables, ...validSnapshot.tables], functions: [...validSnapshot.functions, ...validSnapshot.functions] }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Duplicate table entry: public\.profiles/);
  assert.match(result.stderr, /Duplicate function overload: public\.get_profile/);
});
test('SECURITY DEFINER functions must declare searchPath', async (t) => {
  const result = await runValidator(t, JSON.stringify({ ...validSnapshot, functions: [{ ...validSnapshot.functions[0], securityDefiner: true }] }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SECURITY DEFINER function must record searchPath/);
});
test('malformed JSON returns a controlled validation error', async (t) => {
  const result = await runValidator(t, '{not-json');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unable to parse contract snapshot/);
});
