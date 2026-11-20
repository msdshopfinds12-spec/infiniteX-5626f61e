#!/usr/bin/env node
/**
 * Disposable-only migration replay. Never connects to a hosted project.
 * Exit 0 = complete replay; exit 2 = blocked by missing platform/baseline prerequisite;
 * exit 1 = migration integrity or SQL execution defect.
 */
import { createHash } from 'node:crypto';
import { appendFile, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export function classifyPsqlFailure(output = '') {
  if (/relation\s+"?[^"\n]+"?\s+does not exist|schema\s+"?[^"\n]+"?\s+does not exist|role\s+"?[^"\n]+"?\s+does not exist|extension\s+"?[^"\n]+"?\s+is not available|must be loaded via shared_preload_libraries|database\s+"?[^"\n]+"?\s+does not exist/i.test(output)) {
    return 'BLOCKED';
  }
  return 'FAIL';
}

export function validateProvenance({ manifest, classification, files }) {
  const errors = [];
  if (manifest?.ledger_entry_count !== 19 || manifest?.applied_migrations?.length !== 19) {
    errors.push('Recovered applied history must contain exactly 19 ledger entries.');
  }
  if (classification?.schemaVersion !== 1 || !Array.isArray(classification?.candidateMigrations)) {
    errors.push('Candidate classification document is missing or unsupported.');
  }
  if (classification?.candidateMigrations?.length !== 1) {
    errors.push('Exactly one separately classified candidate migration is expected for this rehearsal.');
  }
  const applied = new Set((manifest?.applied_migrations ?? []).map((entry) => entry.path));
  const candidates = new Set((classification?.candidateMigrations ?? []).map((entry) => entry.path));
  for (const candidate of classification?.candidateMigrations ?? []) {
    if (applied.has(candidate.path)) errors.push('Candidate migration overlaps recovered applied history: ' + candidate.path);
    if (candidate.classification !== 'PROPOSED_NOT_APPLIED'
        || candidate.sourceStatus !== 'NOT_VERIFIED_LIVE'
        || candidate.productionApproval !== 'NOT_GRANTED'
        || !/^[a-f0-9]{64}$/.test(candidate.sha256 ?? '')) {
      errors.push('Candidate must remain hash-verified, proposed only, not live-verified, and not production-approved: ' + candidate.path);
    }
  }
  const expected = new Set([...applied, ...candidates]);
  for (const file of files) if (!expected.has(file)) errors.push('Unclassified SQL migration: ' + file);
  for (const file of expected) if (!files.includes(file)) errors.push('Classified SQL migration missing from disk: ' + file);
  return errors;
}

function runPsql(args, env) {
  const result = spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', ...args], {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) return { status: 127, output: result.error.message };
  return { status: result.status ?? 1, output: [result.stdout, result.stderr].filter(Boolean).join('\n') };
}

async function main() {
  const root = process.cwd();
  const manifest = JSON.parse(await readFile(path.join(root, 'docs/database/MIGRATION-LEDGER-RECOVERY-MANIFEST.json'), 'utf8'));
  const classification = JSON.parse(await readFile(path.join(root, 'docs/database/MIGRATION-PROVENANCE-CLASSIFICATION.json'), 'utf8'));
  const entries = await readdir(path.join(root, 'supabase/migrations'), { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => 'supabase/migrations/' + entry.name).sort();
  const inventoryErrors = validateProvenance({ manifest, classification, files });
  const report = {
    schemaVersion: 1,
    status: 'NOT_RUN',
    database: 'disposable PostgreSQL only',
    postgresTarget: 'Supabase PostgreSQL 17 image',
    recoveredMigrationCount: manifest.applied_migrations?.length ?? 0,
    candidateCount: classification.candidateMigrations?.length ?? 0,
    appliedMigrationsExecuted: 0,
    candidateExecuted: false,
    blockedAt: null,
    message: null,
    inventoryErrors,
  };
  const reportPath = path.join(process.env.RUNNER_TEMP || '/tmp', 'infinitex-phase-52-1c-report.json');
  const finish = async (status, exitCode, message, blockedAt = null) => {
    report.status = status;
    report.message = message;
    report.blockedAt = blockedAt;
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
    const summary = [
      '## Phase 52.1C migration rehearsal',
      '- Status: **' + status + '**',
      '- Recovered migrations: ' + report.recoveredMigrationCount,
      '- Applied migrations executed: ' + report.appliedMigrationsExecuted,
      '- Candidate migration executed: ' + (report.candidateExecuted ? 'yes (disposable only)' : 'no'),
      '- Result: ' + message,
      blockedAt ? '- First blocked migration: ' + blockedAt : '',
      '- Report: ' + reportPath,
    ].filter(Boolean).join('\n') + '\n';
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
    console.log(summary);
    process.exitCode = exitCode;
  };

  if (inventoryErrors.length) {
    await finish('FAIL', 1, 'Provenance inventory validation failed: ' + inventoryErrors.join('; '));
    return;
  }
  if (!process.env.PGDATABASE || !process.env.PGHOST || !process.env.PGUSER) {
    await finish('BLOCKED', 2, 'Disposable PostgreSQL connection variables are incomplete; no connection was attempted.');
    return;
  }

  const env = { ...process.env };
  const bootstrapPath = path.join(root, 'tests/database/phase-52-1c-platform-bootstrap.sql');
  const bootstrap = runPsql(['-f', bootstrapPath], env);
  if (bootstrap.status !== 0) {
    const classificationResult = classifyPsqlFailure(bootstrap.output);
    await finish(classificationResult, classificationResult === 'BLOCKED' ? 2 : 1,
      'Disposable platform bootstrap failed: ' + bootstrap.output.slice(-1800));
    return;
  }

  const ordered = [...manifest.applied_migrations].sort((a, b) => a.version.localeCompare(b.version));
  for (const entry of ordered) {
    const absolute = path.resolve(root, entry.path);
    if (!absolute.startsWith(path.resolve(root, 'supabase/migrations') + path.sep)) {
      await finish('FAIL', 1, 'Unsafe migration path rejected: ' + entry.path);
      return;
    }
    const bytes = await readFile(absolute);
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== entry.sha256) {
      await finish('FAIL', 1, 'SHA-256 mismatch for ' + entry.path);
      return;
    }
    const result = runPsql(['-f', absolute], env);
    if (result.status !== 0) {
      const classificationResult = classifyPsqlFailure(result.output);
      const message = 'Replay stopped safely at ' + entry.path + '. ' + result.output.slice(-2200);
      await finish(classificationResult, classificationResult === 'BLOCKED' ? 2 : 1, message, entry.path);
      return;
    }
    report.appliedMigrationsExecuted += 1;
    console.log('REPLAY PASS ' + entry.version + ' ' + entry.path);
  }

  for (const candidate of classification.candidateMigrations) {
    const absolute = path.resolve(root, candidate.path);
    const bytes = await readFile(absolute);
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== candidate.sha256) {
      await finish('FAIL', 1, 'Candidate SHA-256 mismatch: ' + candidate.path);
      return;
    }
    const result = runPsql(['-f', absolute], env);
    if (result.status !== 0) {
      const classificationResult = classifyPsqlFailure(result.output);
      await finish(classificationResult, classificationResult === 'BLOCKED' ? 2 : 1,
        'Candidate-only disposable rehearsal failed: ' + result.output.slice(-2200), candidate.path);
      return;
    }
    report.candidateExecuted = true;
    console.log('CANDIDATE PASS (disposable only) ' + candidate.path);
  }

  await finish('PASS', 0, 'All recovered applied migrations and separately classified candidate migration executed successfully in disposable PostgreSQL.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error('FAIL: ' + error.stack);
    process.exitCode = 1;
  });
}
