import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sqlPath = new URL('../../supabase/contracts/capture-database-contract.readonly.sql', import.meta.url);

test('catalog capture is one read-only SELECT statement', async () => {
  const sql = await readFile(sqlPath, 'utf8');
  assert.match(sql.trim(), /^WITH\\b[\\s\\S]*\\bSELECT\\s+jsonb_build_object[\\s\\S]*;$/i);
  assert.equal((sql.match(/\\bSELECT\\s+jsonb_build_object\\s*\\(/gi) ?? []).length, 1);
  assert.doesNotMatch(sql, /^\\s*(CREATE|ALTER|INSERT|UPDATE|DELETE|DROP|TRUNCATE|GRANT|REVOKE|CALL|DO)\\b/im);
});

test('catalog capture includes required RLS and function security metadata', async () => {
  const sql = await readFile(sqlPath, 'utf8');
  for (const token of ['pg_policies', 'relrowsecurity', 'pg_proc', 'prosecdef', 'search_path', 'aclexplode', 'PENDING_REVIEW']) {
    assert.ok(sql.includes(token), `missing catalog field or safety marker: ${token}`);
  }
});

test('catalog capture excludes application row and secret-value queries', async () => {
  const sql = await readFile(sqlPath, 'utf8');
  assert.doesNotMatch(sql, /vault\\.decrypted_secrets|vault\\.secrets|platform_api_keys|webhook_events/i);
  assert.doesNotMatch(sql, /net\\.http_post|cron\\.schedule/i);
});
