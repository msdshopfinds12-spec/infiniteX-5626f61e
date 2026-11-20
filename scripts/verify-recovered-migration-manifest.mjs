#!/usr/bin/env node
/**
 * Verify ledger-recovered migration files against their checked-in SHA-256 manifest.
 * Offline only: reads repository files and performs no database/network operations.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const manifestPath = path.join(root, 'docs', 'database', 'MIGRATION-LEDGER-RECOVERY-MANIFEST.json');
const migrationsRoot = path.resolve(root, 'supabase', 'migrations');
const expectedCount = 19;

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch (error) {
  console.error(`BLOCKED: unable to read/parse migration recovery manifest: ${error.message}`);
  process.exit(2);
}

if (manifest?.ledger_entry_count !== expectedCount) {
  fail(`Expected ledger_entry_count=${expectedCount}; found ${manifest?.ledger_entry_count}.`);
}

const entries = manifest?.applied_migrations;
if (!Array.isArray(entries) || entries.length !== expectedCount) {
  fail(`Expected exactly ${expectedCount} applied_migrations entries.`);
  process.exit(1);
}

const seenVersions = new Set();
const seenPaths = new Set();
let verified = 0;

for (const entry of entries) {
  const version = entry?.version;
  const relativePath = entry?.path;
  const expectedHash = entry?.sha256;

  if (typeof version !== 'string' || !/^\\d{14}$/.test(version)) {
    fail(`Invalid migration version: ${String(version)}`);
    continue;
  }
  if (seenVersions.has(version)) {
    fail(`Duplicate migration version: ${version}`);
    continue;
  }
  seenVersions.add(version);

  if (typeof relativePath !== 'string'
      || !relativePath.startsWith('supabase/migrations/')
      || path.isAbsolute(relativePath)) {
    fail(`Unsafe or invalid manifest path for version ${version}.`);
    continue;
  }

  const absolutePath = path.resolve(root, relativePath);
  if (!absolutePath.startsWith(migrationsRoot + path.sep)) {
    fail(`Manifest path escapes migrations directory: ${relativePath}`);
    continue;
  }
  if (seenPaths.has(relativePath)) {
    fail(`Duplicate migration path: ${relativePath}`);
    continue;
  }
  seenPaths.add(relativePath);

  if (!path.basename(relativePath).startsWith(`${version}_`)) {
    fail(`Filename/version mismatch: ${relativePath}`);
    continue;
  }
  if (typeof expectedHash !== 'string' || !/^[a-f0-9]{64}$/.test(expectedHash)) {
    fail(`Invalid SHA-256 value for ${relativePath}`);
    continue;
  }

  let bytes;
  try {
    bytes = await readFile(absolutePath);
  } catch (error) {
    fail(`Cannot read ${relativePath}: ${error.message}`);
    continue;
  }

  const actualHash = createHash('sha256').update(bytes).digest('hex');
  if (actualHash !== expectedHash) {
    fail(`SHA-256 mismatch for ${relativePath}: expected ${expectedHash}, got ${actualHash}`);
    continue;
  }

  if (entry.statement_count !== 1 || entry.rollback_available !== false) {
    fail(`Unexpected provenance metadata for ${relativePath}; review manifest semantics.`);
    continue;
  }

  verified += 1;
  console.log(`PASS ${version} ${relativePath} sha256=${actualHash}`);
}

if (verified !== expectedCount) {
  fail(`Verified ${verified}/${expectedCount} recovered migration files.`);
}

if (process.exitCode) {
  console.error('Recovered migration checksum verification FAILED.');
} else {
  console.log(`PASS: all ${verified} ledger-recovered migration files match the manifest.`);
  console.log('NOTE: checksum integrity does not prove original Git blob equivalence or live schema parity.');
}
