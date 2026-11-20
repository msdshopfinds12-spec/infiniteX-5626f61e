#!/usr/bin/env node
/**
 * Fail-closed migration inventory classification.
 * Offline repository inspection only; never connects to a database.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const manifestPath = path.join(root, 'docs/database/MIGRATION-LEDGER-RECOVERY-MANIFEST.json');
const classificationPath = path.join(root, 'docs/database/MIGRATION-PROVENANCE-CLASSIFICATION.json');
const migrationsDir = path.resolve(root, 'supabase/migrations');

export function validateMigrationInventory({ appliedEntries, candidateEntries, files }) {
  const errors = [];
  const appliedPaths = new Set();
  const candidatePaths = new Set();
  const versions = new Set();

  if (!Array.isArray(appliedEntries) || !Array.isArray(candidateEntries) || !Array.isArray(files)) {
    return ['Applied entries, candidate entries, and files must be arrays.'];
  }

  for (const entry of appliedEntries) {
    if (!entry || typeof entry.version !== 'string' || !/^\d{14}$/.test(entry.version)) {
      errors.push('Applied migration has an invalid version.');
      continue;
    }
    if (versions.has(entry.version)) errors.push(`Duplicate migration version: ${entry.version}`);
    versions.add(entry.version);
    if (typeof entry.path !== 'string' || !entry.path.startsWith('supabase/migrations/')) {
      errors.push(`Unsafe applied migration path: ${String(entry.path)}`);
      continue;
    }
    if (appliedPaths.has(entry.path)) errors.push(`Duplicate applied migration path: ${entry.path}`);
    appliedPaths.add(entry.path);
  }

  for (const entry of candidateEntries) {
    if (!entry || typeof entry.version !== 'string' || !/^\d{14}$/.test(entry.version)) {
      errors.push('Candidate migration has an invalid version.');
      continue;
    }
    if (versions.has(entry.version)) errors.push(`Candidate version overlaps or duplicates another migration: ${entry.version}`);
    versions.add(entry.version);
    if (typeof entry.path !== 'string' || !entry.path.startsWith('supabase/migrations/')) {
      errors.push(`Unsafe candidate migration path: ${String(entry.path)}`);
      continue;
    }
    if (candidatePaths.has(entry.path)) errors.push(`Duplicate candidate migration path: ${entry.path}`);
    candidatePaths.add(entry.path);
    if (entry.classification !== 'PROPOSED_NOT_APPLIED') {
      errors.push(`Candidate must be classified PROPOSED_NOT_APPLIED: ${entry.path}`);
    }
    if (entry.sourceStatus !== 'NOT_VERIFIED_LIVE') {
      errors.push(`Candidate must remain NOT_VERIFIED_LIVE: ${entry.path}`);
    }
    if (entry.productionApproval !== 'NOT_GRANTED') {
      errors.push(`Candidate production approval must remain NOT_GRANTED: ${entry.path}`);
    }
    if (typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      errors.push(`Candidate SHA-256 is missing or invalid: ${entry.path}`);
    }
  }

  for (const file of files) {
    if (!appliedPaths.has(file) && !candidatePaths.has(file)) {
      errors.push(`Unclassified SQL migration file: ${file}`);
    }
  }
  for (const file of appliedPaths) {
    if (!files.includes(file)) errors.push(`Applied manifest file is missing: ${file}`);
  }
  for (const file of candidatePaths) {
    if (!files.includes(file)) errors.push(`Candidate migration file is missing: ${file}`);
  }
  return errors;
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const classification = JSON.parse(await readFile(classificationPath, 'utf8'));
  if (manifest.ledger_entry_count !== 19 || manifest.applied_migrations?.length !== 19) {
    throw new Error('Recovered applied ledger must remain exactly 19 entries; do not rewrite history.');
  }
  if (classification.schemaVersion !== 1
      || classification.appliedSource !== 'docs/database/MIGRATION-LEDGER-RECOVERY-MANIFEST.json'
      || !Array.isArray(classification.candidateMigrations)) {
    throw new Error('Migration provenance classification document is missing or unsupported.');
  }

  const entries = await readdir(migrationsDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => `supabase/migrations/${entry.name}`)
    .sort();
  const errors = validateMigrationInventory({
    appliedEntries: manifest.applied_migrations,
    candidateEntries: classification.candidateMigrations,
    files,
  });

  const records = [...manifest.applied_migrations, ...classification.candidateMigrations];
  for (const entry of records) {
    const absolute = path.resolve(root, entry.path);
    if (!absolute.startsWith(migrationsDir + path.sep)) {
      errors.push(`Path escapes migration directory: ${entry.path}`);
      continue;
    }
    let bytes;
    try { bytes = await readFile(absolute); }
    catch (error) { errors.push(`Cannot read ${entry.path}: ${error.message}`); continue; }
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== entry.sha256) errors.push(`SHA-256 mismatch: ${entry.path}`);
  }

  if (errors.length) {
    console.error('FAIL: migration provenance inventory is incomplete or inconsistent.');
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`PASS: ${manifest.applied_migrations.length} ledger-recovered applied files are classified separately.`);
  for (const candidate of classification.candidateMigrations) {
    console.log(`CANDIDATE ONLY: ${candidate.version} ${candidate.path} [${candidate.classification}; ${candidate.sourceStatus}]`);
  }
  console.log(`PASS: all ${files.length} SQL migration files have exactly one provenance classification and a matching SHA-256.`);
  console.log('LIMITATION: repository provenance checks do not prove live database state or original historical Git blob equivalence.');
}

main().catch((error) => {
  console.error(`BLOCKED: ${error.message}`);
  process.exitCode = 2;
});
