import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sqlPath = new URL('../../supabase/contracts/capture-database-contract.readonly.sql', import.meta.url);

test('catalog capture is one read-only SELECT statement', async () => {
  const sql = await readFile(sqlPath, 'utf8');
  const trimmed = sql.trim();
  assert.match(trimmed, /^--[^\\n]*\\nWITH\\nscope_schemas AS \\(/, 'catalog capture must begin with scoped schema CTE');
  assert.ok(trimmed.endsWith(';'));
  assert.equal(sql.split('SELECT jsonb_build_object(').length - 1, 1);
  const mutationWords = new Set(['CREATE', 'ALTER', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'TRUNCATE', 'GRANT', 'REVOKE', 'CALL', 'DO']);
  const mutation = sql.split('\n').some((line) => mutationWords.has(line.trim().split(' ')[0].toUpperCase()));
  assert.equal(mutation, false);
});

test('catalog capture includes required RLS and function security metadata', async () => {
  const sql = await readFile(sqlPath, 'utf8');
  for (const token of ['pg_policies', 'relrowsecurity', 'pg_proc', 'prosecdef', 'search_path', 'aclexplode', 'PENDING_HUMAN_REVIEW']) {
    assert.ok(sql.includes(token), `missing catalog field or safety marker: ${token}`);
  }
});

test('catalog capture excludes application row and secret-value queries', async () => {
  const sql = await readFile(sqlPath, 'utf8');
  for (const token of ['vault.decrypted_secrets', 'vault.secrets', 'platform_api_keys', 'webhook_events', 'net.http_post', 'cron.schedule']) {
    assert.equal(sql.includes(token), false, `unexpected sensitive or side-effect reference: ${token}`);
  }
});

test('ACL aggregation uses explicit deterministic catalog fields', async () => {
  const sql = await readFile(sqlPath, 'utf8');
  assert.ok(sql.includes('ORDER BY a.grantee,a.privilege_type,a.is_grantable'), 'relation/schema ACLs must sort by explicit ACL fields');
  assert.ok(sql.includes('ORDER BY a.attnum,x.grantee,x.privilege_type,x.is_grantable'), 'column ACLs must sort by ordinal and explicit ACL fields');
  assert.equal(/ORDER BY\\s+1\\s*,\\s*2\\s*,\\s*3/.test(sql), false, 'positional ACL ordering is forbidden');
});
