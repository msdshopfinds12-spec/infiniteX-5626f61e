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
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
if (!isRecord(snapshot)) {
  console.error('Database contract snapshot INVALID: root must be a JSON object.');
  process.exit(1);
}

if (snapshot.schemaVersion !== 1) errors.push('schemaVersion must equal 1.');
if (typeof snapshot.capturedAt !== 'string' || !snapshot.capturedAt || Number.isNaN(Date.parse(snapshot.capturedAt))) {
  errors.push('capturedAt must be a valid ISO-8601 timestamp.');
}
if (typeof snapshot.source !== 'string' || !snapshot.source.trim()) errors.push('source must identify the capture provenance.');
if (!Array.isArray(snapshot.tables)) errors.push('tables must be an array.');
if (!Array.isArray(snapshot.functions)) errors.push('functions must be an array.');

const tableNames = new Set();
if (Array.isArray(snapshot.tables)) {
  for (const [index, table] of snapshot.tables.entries()) {
    if (!isRecord(table)) {
      errors.push(`tables[${index}] must be a JSON object.`);
      continue;
    }
    const validIdentity = typeof table.schema === 'string' && table.schema.trim()
      && typeof table.name === 'string' && table.name.trim();
    if (!validIdentity) errors.push(`tables[${index}] requires non-empty string schema and name.`);
    const key = validIdentity ? `${table.schema}.${table.name}` : `tables[${index}]`;
    if (validIdentity && tableNames.has(key)) errors.push(`Duplicate table entry: ${key}.`);
    if (validIdentity) tableNames.add(key);
    if (typeof table.rlsEnabled !== 'boolean') errors.push(`${key}: rlsEnabled must be boolean.`);
    if (!Array.isArray(table.policies)) errors.push(`${key}: policies must be an array (empty is valid).`);
  }
}

const functionKeys = new Set();
if (Array.isArray(snapshot.functions)) {
  for (const [index, fn] of snapshot.functions.entries()) {
    if (!isRecord(fn)) {
      errors.push(`functions[${index}] must be a JSON object.`);
      continue;
    }
    const validIdentity = typeof fn.schema === 'string' && fn.schema.trim()
      && typeof fn.name === 'string' && fn.name.trim();
    if (!validIdentity) errors.push(`functions[${index}] requires non-empty string schema and name.`);
    if (fn.identityArguments !== undefined && typeof fn.identityArguments !== 'string') {
      errors.push(`functions[${index}].identityArguments must be a string when provided.`);
    }
    const key = validIdentity
      ? `${fn.schema}.${fn.name}(${typeof fn.identityArguments === 'string' ? fn.identityArguments : ''})`
      : `functions[${index}]`;
    if (validIdentity && functionKeys.has(key)) errors.push(`Duplicate function overload: ${key}.`);
    if (validIdentity) functionKeys.add(key);
    if (typeof fn.securityDefiner !== 'boolean') errors.push(`${key}: securityDefiner must be boolean.`);
    if (!Array.isArray(fn.executeRoles) || fn.executeRoles.some((role) => typeof role !== 'string' || !role.trim())) {
      errors.push(`${key}: executeRoles must be an array of non-empty role names.`);
    }
    if (fn.securityDefiner && !Object.hasOwn(fn, 'searchPath')) {
      errors.push(`${key}: SECURITY DEFINER function must record searchPath (use empty string when unset).`);
    }
    if (Object.hasOwn(fn, 'searchPath') && typeof fn.searchPath !== 'string') {
      errors.push(`${key}: searchPath must be a string.`);
    }
  }
}

if (errors.length) {
  console.error('Database contract snapshot INVALID:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Database contract snapshot structure valid: ${snapshot.tables.length} table(s), ${snapshot.functions.length} function overload(s).`);
console.log('NOTE: Structural validity is not schema parity. Compare the snapshot to a trusted live capture and reviewed contract.');
