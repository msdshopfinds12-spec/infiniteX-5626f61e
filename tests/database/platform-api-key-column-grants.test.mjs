import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const migrationUrl = new URL(
  '../../supabase/migrations/20261120120000_harden_platform_api_key_column_access.sql',
  import.meta.url,
);
const migrationPath = fileURLToPath(migrationUrl);

test('API-key client grants exclude key_hash and retain metadata-only access', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /revoke\s+select\s+on\s+table\s+public\.platform_api_keys\s+from\s+authenticated\s*;/i);
  assert.match(sql, /grant\s+select\s*\([\s\S]*?\)\s*on\s+table\s+public\.platform_api_keys\s+to\s+authenticated\s*;/i);
  assert.doesNotMatch(
    sql.match(/grant\s+select\s*\(([\s\S]*?)\)\s*on\s+table\s+public\.platform_api_keys/i)?.[1] ?? '',
    /\bkey_hash\b/i,
    'key_hash must not appear in the authenticated column allow-list',
  );
  assert.match(sql, /revoke\s+update\s+on\s+table\s+public\.platform_api_keys\s+from\s+authenticated\s*;/i);
  assert.match(sql, /grant\s+update\s*\(\s*revoked_at\s*\)\s*on\s+table\s+public\.platform_api_keys\s+to\s+authenticated\s*;/i);
});

test('migration documents server-only hash and preserves RLS as row authorization', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /key_hash column is intentionally server-only/i);
  assert.match(sql, /owner-scoped RLS policies remain the row-level authorization boundary/i);
});
