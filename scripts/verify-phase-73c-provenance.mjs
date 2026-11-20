import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const root = process.cwd();
const failures = [];
const checks = [];
async function readJson(path) { return JSON.parse(await readFile(resolve(root, path), 'utf8')); }
function check(condition, label, detail = '') {
  checks.push({ label, passed: Boolean(condition) });
  if (!condition) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
}
const manifestPath = 'docs/database/MIGRATION-LEDGER-RECOVERY-MANIFEST.json';
const snapshotPath = 'docs/database/live-schema-metadata.snapshot.json';
const classificationPath = 'docs/database/MIGRATION-PROVENANCE-CLASSIFICATION.json';
const baselinePath = 'docs/engineering/INFINITEX-LIVE-SCHEMA-RLS-BASELINE-2026-11-20.md';
try {
  const manifest = await readJson(manifestPath);
  const snapshot = await readJson(snapshotPath);
  const classification = await readJson(classificationPath);
  const baseline = await readFile(resolve(root, baselinePath), 'utf8');
  check(manifest.ledger_entry_count === 19, 'Manifest ledger count is 19');
  check(Array.isArray(manifest.applied_migrations) && manifest.applied_migrations.length === manifest.ledger_entry_count, 'Manifest entries match ledger count');
  const versions = new Set();
  for (const entry of manifest.applied_migrations ?? []) {
    check(typeof entry.version === 'string' && !versions.has(entry.version), `Unique migration version ${entry.version}`);
    versions.add(entry.version);
    check(entry.statement_count === 1, `Single stored statement ${entry.version}`);
    check(entry.original_git_blob_equivalence === 'NOT_VERIFIED', `Historical Git provenance remains explicit ${entry.version}`);
    check(entry.ledger_statement_to_recovered_file_exact_match === 'VERIFIED_EXACT_STRING_MATCH', `Ledger/file match is classified ${entry.version}`);
    const relative = entry.path;
    const absolute = resolve(root, relative);
    check(typeof relative === 'string' && relative.startsWith('supabase/migrations/') && !relative.split('/').includes('..') && absolute.startsWith(resolve(root, 'supabase/migrations') + sep), `Migration path is confined ${entry.version}`);
    if (typeof relative === 'string' && relative.startsWith('supabase/migrations/') && !relative.split('/').includes('..')) {
      try {
        const sql = await readFile(absolute);
        const digest = createHash('sha256').update(sql).digest('hex');
        check(digest === entry.sha256, `Recovered SQL SHA-256 ${entry.version}`, `expected ${entry.sha256}, got ${digest}`);
      } catch (error) { check(false, `Recovered SQL exists ${entry.version}`, error.message); }
    }
  }
  check(Array.isArray(snapshot.tables) && snapshot.tables.length === 14, 'Partial schema snapshot contains 14 tables');
  check(baseline.includes('14 public tables were returned by verbose schema introspection'), 'RLS baseline summary agrees with 14-table inventory');
  check(!baseline.includes('13 public tables were returned by verbose schema introspection'), 'Stale 13-table summary is absent');
  const candidate = classification.candidateMigrations?.find(item => item.version === '20261120120000');
  check(candidate?.classification === 'PROPOSED_NOT_APPLIED', 'API-key migration remains proposed, not applied');
  check(candidate?.sourceStatus === 'NOT_VERIFIED_LIVE', 'API-key migration live status remains unverified');
  check(candidate?.productionApproval === 'NOT_GRANTED', 'API-key migration production approval remains not granted');
} catch (error) { failures.push(`Audit setup failed: ${error.message}`); }

for (const item of checks) console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.label}`);
if (failures.length) {
  console.error(`\nPhase 73C provenance audit failed (${failures.length} issue(s)):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`\nPhase 73C provenance audit passed (${checks.length} checks).`);
}
