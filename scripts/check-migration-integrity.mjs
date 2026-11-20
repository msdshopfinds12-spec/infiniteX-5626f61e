#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const migrationDir = path.join(root, 'supabase', 'migrations');
const versionPattern = /^(\d{14})_([a-z0-9][a-z0-9_-]*)\.sql$/i;
const errors = [];
const warnings = [];
let files;

try {
  files = (await readdir(migrationDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort();
} catch (error) {
  if (error?.code === 'ENOENT') {
    console.error('BLOCKED: supabase/migrations/ does not exist.');
    console.error('Recover original migration sources or add an explicitly labeled baseline; do not fabricate history.');
    process.exit(2);
  }
  throw error;
}

if (files.length === 0) {
  errors.push('No SQL migration files found in supabase/migrations/.');
}

const versions = new Map();
for (const file of files) {
  const match = file.match(versionPattern);
  if (!match) {
    errors.push(`Invalid migration filename: ${file}. Expected YYYYMMDDHHMMSS_description.sql.`);
    continue;
  }
  const [, version] = match;
  const prior = versions.get(version);
  if (prior) errors.push(`Duplicate migration version ${version}: ${prior} and ${file}.`);
  else versions.set(version, file);

  const content = await readFile(path.join(migrationDir, file));
  if (content.length === 0) errors.push(`Empty migration file: ${file}.`);
  if (content.includes(0)) errors.push(`Binary/NUL byte found in migration file: ${file}.`);
  const digest = createHash('sha256').update(content).digest('hex');
  console.log(`OK ${file} sha256=${digest}`);
}

const ordered = [...versions.keys()].sort();
if (ordered.some((version, index) => index > 0 && version < ordered[index - 1])) {
  errors.push('Migration versions are not ordered.');
}

if (errors.length) {
  console.error('\nMigration integrity FAILED:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Migration filename/content checks passed for ${files.length} file(s).`);
console.log('NOTE: This does not prove parity with the live migration ledger or schema.');
if (warnings.length) for (const warning of warnings) console.warn(warning);
