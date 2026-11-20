#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const snapshotPath = path.join(process.cwd(), 'supabase', 'contracts', 'database-contract.snapshot.json');
let snapshot;
try {
  snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
} catch (error) {
  if (error?.code === 'ENOENT') {
    console.error('BLOCKED: database-contract.snapshot.json is not present.');
    console.error('Capture and review a sanitized, read-only catalog snapshot before enforcing live schema assertions.');
    process.exit(2);
  }
  console.error(`Unable to parse contract snapshot: ${error.message}`);
  process.exit(1);
}

const errors = [];
if (snapshot.schemaVersion !== 1) errors.push('schemaVersion must equal 1.');
if (!snapshot.capturedAt || Number.isNaN(Date.parse(snapshot.capturedAt))) errors.push('capturedAt must be a valid ISO-8601 timestamp.');
if (!snapshot.source || typeof snapshot.source !== 'string') errors.push('source must identify the capture provenance.');
if (!Array.isArray(snapshot.tables)) errors.push('tables must be an array.');
if (!Array.isArray(snapshot.functions)) errors.push('functions must be an array.');

const tableNames = new Set();
for (const table of snapshot.tables ?? []) {
  const key = `${table.schema}.${table.name}`;
  if (!table.schema || !table.name) errors.push('Every table requires schema and name.');
  if (tableNames.has(key)) errors.push(`Duplicate table entry: ${key}.`);
  tableNames.add(key);
  if (typeof table.rlsEnabled !== 'boolean') errors.push(`${key}: rlsEnabled must be boolean.`);
  if (!Array.isArray(table.policies)) errors.push(`${key}: policies must be an array (empty is valid).`);
}

const functionKeys = new Set();
for (const fn of snapshot.functions ?? []) {
  const key = `${fn.schema}.${fn.name}(${fn.identityArguments ?? ''})`;
  if (!fn.schema || !fn.name) errors.push('Every function requires schema and name.');
  if (functionKeys.has(key)) errors.push(`Duplicate function overload: ${key}.`);
  functionKeys.add(key);
  if (typeof fn.securityDefiner !== 'boolean') errors.push(`${key}: securityDefiner must be boolean.`);
  if (!Array.isArray(fn.executeRoles)) errors.push(`${key}: executeRoles must be an array.`);
  if (fn.securityDefiner && !Object.hasOwn(fn, 'searchPath')) errors.push(`${key}: SECURITY DEFINER function must record searchPath (use empty string when unset).`);
}

if (errors.length) {
  console.error('Database contract snapshot INVALID:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Database contract snapshot structure valid: ${snapshot.tables.length} table(s), ${snapshot.functions.length} function overload(s).`);
console.log('NOTE: Structural validity is not schema parity. Compare the snapshot to a trusted live capture and reviewed contract.');
