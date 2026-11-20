#!/usr/bin/env node
/**
 * Static, offline inventory of high-impact SQL side effects in recovered migrations.
 * This is a guardrail, not a SQL parser, execution test, or proof of Supabase parity.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const manifestPath = path.join(root, 'docs/database/MIGRATION-LEDGER-RECOVERY-MANIFEST.json');
const policyPath = path.join(root, 'docs/database/migration-side-effect-policy.json');
const expectedCount = 19;

export function stripSqlComments(source) {
  let output = '';
  let i = 0;
  let state = 'normal';
  let dollarTag = '';
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (state === 'line') {
      if (ch === '\n') { output += '\n'; state = 'normal'; }
      else output += ' ';
      i += 1; continue;
    }
    if (state === 'block') {
      if (ch === '*' && next === '/') { output += '  '; i += 2; state = 'normal'; }
      else { output += ch === '\n' ? '\n' : ' '; i += 1; }
      continue;
    }
    if (state === 'single' || state === 'double') {
      const quote = state === 'single' ? "'" : '"';
      output += ch;
      if (ch === quote && next === quote) { output += next; i += 2; continue; }
      if (ch === quote) state = 'normal';
      i += 1; continue;
    }
    if (state === 'dollar') {
      if (source.startsWith(dollarTag, i)) {
        output += dollarTag; i += dollarTag.length; state = 'normal'; dollarTag = '';
      } else { output += ch; i += 1; }
      continue;
    }
    if (ch === '-' && next === '-') { output += '  '; i += 2; state = 'line'; continue; }
    if (ch === '/' && next === '*') { output += '  '; i += 2; state = 'block'; continue; }
    if (ch === "'") { output += ch; i += 1; state = 'single'; continue; }
    if (ch === '"') { output += ch; i += 1; state = 'double'; continue; }
    if (ch === '$') {
      const match = source.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) { dollarTag = match[0]; output += dollarTag; i += dollarTag.length; state = 'dollar'; continue; }
    }
    output += ch; i += 1;
  }
  return output;
}

const PATTERNS = Object.freeze({
  cron_schedule: /\bcron\s*\.\s*schedule\s*\(/gi,
  cron_unschedule: /\bcron\s*\.\s*unschedule\s*\(/gi,
  net_http_post: /\bnet\s*\.\s*http_post\s*\(/gi,
  vault_reference: /\bvault\s*\./gi,
  extension_ddl: /\bcreate\s+extension\b/gi,
  external_http_url: /https?:\/\/[a-z0-9.-]+(?::\d+)?(?:\/[^\s'")}]*)?/gi
});

export function scanSqlRisk(source) {
  const sql = stripSqlComments(source);
  const findings = {};
  for (const [category, pattern] of Object.entries(PATTERNS)) {
    const matches = [...sql.matchAll(pattern)];
    if (matches.length) findings[category] = matches.length;
  }
  return findings;
}

export function evaluateSideEffectPolicy(observed, allowedVersions) {
  const errors = [];
  const categories = new Set([...Object.keys(observed), ...Object.keys(allowedVersions)]);
  for (const category of categories) {
    const actual = [...(observed[category] ?? [])].sort();
    const expected = [...(allowedVersions[category] ?? [])].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      errors.push(`${category}: expected [${expected.join(', ')}], observed [${actual.join(', ')}]`);
    }
  }
  return errors;
}

export async function runAudit() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const policy = JSON.parse(await readFile(policyPath, 'utf8'));
  if (manifest.ledger_entry_count !== expectedCount || manifest.applied_migrations?.length !== expectedCount) {
    throw new Error(`Expected exactly ${expectedCount} recovered migration entries.`);
  }
  if (policy.schemaVersion !== 1 || !policy.allowedVersions || typeof policy.allowedVersions !== 'object') {
    throw new Error('Side-effect policy is missing or unsupported.');
  }

  const observed = {};
  for (const entry of manifest.applied_migrations) {
    const relative = entry.path;
    if (typeof relative !== 'string' || !relative.startsWith('supabase/migrations/')) {
      throw new Error('Manifest contains an unsafe migration path.');
    }
    const file = path.resolve(root, relative);
    const migrationsRoot = path.resolve(root, 'supabase/migrations') + path.sep;
    if (!file.startsWith(migrationsRoot)) throw new Error(`Migration path escapes root: ${relative}`);
    const sql = await readFile(file, 'utf8');
    const findings = scanSqlRisk(sql);
    for (const category of Object.keys(findings)) (observed[category] ??= []).push(entry.version);
  }
  for (const versions of Object.values(observed)) versions.sort();
  const errors = evaluateSideEffectPolicy(observed, policy.allowedVersions);
  console.log(`Static side-effect scan: ${expectedCount} recovered migration files`);
  for (const category of Object.keys(policy.allowedVersions).sort()) {
    const versions = observed[category] ?? [];
    console.log(`- ${category}: ${versions.length ? versions.join(', ') : 'none'}`);
  }
  if (errors.length) {
    console.error('FAIL: high-impact SQL side-effect inventory differs from reviewed policy.');
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return false;
  }
  console.log('PASS: observed high-impact side-effect versions exactly match the checked-in review policy.');
  console.log('LIMITATION: static pattern matching only; not SQL parsing, execution, network isolation, or schema parity.');
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runAudit().catch((error) => {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
  });
}
