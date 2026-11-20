import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMigrationInventory } from '../../scripts/verify-migration-provenance.mjs';

const applied = [{ version: '20260101000000', path: 'supabase/migrations/20260101000000_applied.sql' }];
const candidate = [{
  version: '20260102000000',
  path: 'supabase/migrations/20260102000000_candidate.sql',
  classification: 'PROPOSED_NOT_APPLIED',
  sourceStatus: 'NOT_VERIFIED_LIVE',
  productionApproval: 'NOT_GRANTED',
  sha256: 'a'.repeat(64),
}];

test('accepts a complete, disjoint applied/candidate inventory', () => {
  assert.deepEqual(validateMigrationInventory({
    appliedEntries: applied,
    candidateEntries: candidate,
    files: [applied[0].path, candidate[0].path],
  }), []);
});

test('fails closed when an SQL file is not classified', () => {
  const errors = validateMigrationInventory({
    appliedEntries: applied,
    candidateEntries: candidate,
    files: [applied[0].path, candidate[0].path, 'supabase/migrations/20260103000000_untracked.sql'],
  });
  assert.match(errors.join('\n'), /Unclassified SQL migration file/);
});

test('rejects candidate promotion, missing evidence, and production approval', () => {
  const promoted = { ...candidate[0], classification: 'APPLIED', sourceStatus: 'VERIFIED_LIVE', productionApproval: 'GRANTED' };
  const errors = validateMigrationInventory({
    appliedEntries: applied,
    candidateEntries: [promoted],
    files: [applied[0].path, promoted.path],
  });
  assert.match(errors.join('\n'), /PROPOSED_NOT_APPLIED/);
  assert.match(errors.join('\n'), /NOT_VERIFIED_LIVE/);
  assert.match(errors.join('\n'), /NOT_GRANTED/);
});

test('rejects duplicate versions and candidate/applied path overlap', () => {
  const overlapping = { ...candidate[0], version: applied[0].version, path: applied[0].path };
  const errors = validateMigrationInventory({
    appliedEntries: applied,
    candidateEntries: [overlapping],
    files: [applied[0].path],
  });
  assert.match(errors.join('\n'), /overlaps or duplicates/);
  assert.match(errors.join('\n'), /Candidate path overlaps applied migration path/);
});

test('requires every applied and candidate file to exist in the inventory', () => {
  const errors = validateMigrationInventory({
    appliedEntries: applied,
    candidateEntries: candidate,
    files: [],
  });
  assert.match(errors.join('\n'), /Applied manifest file is missing/);
  assert.match(errors.join('\n'), /Candidate migration file is missing/);
});
