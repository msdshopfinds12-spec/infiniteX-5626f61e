#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const migrationDir = path.join(root, 'supabase', 'migrations');
const versionPattern = /^(\d{14})_([a-z0-9][a-z0-9_-]*)\.sql$/;
const errors = [];
let entries;

try {
  entries = await readdir(migrationDir, { withFileTypes: true });
} catch (error) {
  if (error?.code === 'ENOENT') {
    console.error('BLOCKED: supabase/migrations/ does not exist.');
    console.error('Recover original migration sources or add an explicitly labeled baseline; do not fabricate history.');
    process.exit(2);
  }
  console.error(`Unable to read migration directory: ${error.message}`);
  process.exit(1);
}

const sqlEntries = entries.filter((entry) => entry.isFile() && /\.sql$/i.test(entry.name));
const files = sqlEntries.map((entry) => entry.name).sort();

if (files.length === 0) {
  errors.push('No SQL migration files found in supabase/migrations/.');
}

const versions = new Map();
for (const file of files) {
  const match = file.match(versionPattern);
  if (!match) {
    errors.push(`Invalid migration filename: ${file}. Expected YYYYMMDDHHMMSS_lowercase-description.sql.`);
    continue;
  }

  const [, version] = match;
  const year = Number(version.slice(0, 4));
  const month = Number(version.slice(4, 6));
  const day = Number(version.slice(6, 8));
  const hour = Number(version.slice(8, 10));
  const minute = Number(version.slice(10, 12));
  const second = Number(version.slice(12, 14));
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const validTimestamp = Number.isFinite(date.getTime())
    && date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    && date.getUTCHours() === hour
    && date.getUTCMinutes() === minute
    && date.getUTCSeconds() === second;

  if (!validTimestamp) {
    errors.push(`Invalid migration timestamp in ${file}: ${version} is not a real UTC calendar timestamp.`);
    continue;
  }

  const prior = versions.get(version);
  if (prior) errors.push(`Duplicate migration version ${version}: ${prior} and ${file}.`);
  else versions.set(version, file);

  const content = await readFile(path.join(migrationDir, file));
  if (content.length === 0) errors.push(`Empty migration file: ${file}.`);
  if (content.includes(0)) errors.push(`Binary/NUL byte found in migration file: ${file}.`);
  const digest = createHash('sha256').update(content).digest('hex');
  console.log(`OK ${file} sha256=${digest}`);
}

if (errors.length) {
  console.error('\nMigration integrity FAILED:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Migration filename/content checks passed for ${files.length} file(s).`);
console.log('NOTE: This does not prove parity with the live migration ledger or schema.');
