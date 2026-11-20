import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const checker = fileURLToPath(new URL('../../scripts/check-migration-integrity.mjs', import.meta.url));

async function runChecker(t, files = []) {
  const cwd = await mkdtemp(path.join(tmpdir(), 'infinitex-migrations-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const dir = path.join(cwd, 'supabase', 'migrations');
  if (files.length) await mkdir(dir, { recursive: true });
  for (const file of files) {
    await writeFile(path.join(dir, file.name), file.content ?? 'select 1;');
  }
  return spawnSync(process.execPath, [checker], { cwd, encoding: 'utf8' });
}

test('missing migrations directory fails closed with exit code 2', async (t) => {
  const result = await runChecker(t);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /BLOCKED: supabase\/migrations\//);
});

test('valid UTC timestamp and SQL file pass', async (t) => {
  const result = await runChecker(t, [{ name: '20240229123456_valid_leap_day.sql' }]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /checks passed for 1 file/);
});

test('impossible calendar date is rejected', async (t) => {
  const result = await runChecker(t, [{ name: '20230229123456_invalid_leap_day.sql' }]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not a real UTC calendar timestamp/);
});

test('out-of-range time components are rejected', async (t) => {
  const result = await runChecker(t, [{ name: '20240101256061_invalid_time.sql' }]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not a real UTC calendar timestamp/);
});

test('uppercase SQL extension is not silently accepted', async (t) => {
  const result = await runChecker(t, [{ name: '20240101120000_uppercase_extension.SQL' }]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid migration filename/);
});

test('duplicate timestamp versions are rejected', async (t) => {
  const result = await runChecker(t, [
    { name: '20240101120000_first.sql' },
    { name: '20240101120000_second.sql' },
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Duplicate migration version 20240101120000/);
});

test('empty SQL files are rejected', async (t) => {
  const result = await runChecker(t, [{ name: '20240101120000_empty.sql', content: '' }]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Empty migration file/);
});

test('NUL bytes are rejected', async (t) => {
  const result = await runChecker(t, [{ name: '20240101120000_binary.sql', content: Buffer.from([0, 1, 2]) }]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Binary\/NUL byte/);
});
