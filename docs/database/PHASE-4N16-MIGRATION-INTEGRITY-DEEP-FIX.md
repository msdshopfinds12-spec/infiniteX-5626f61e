# Phase 4N.16 — Migration Integrity Deep Fix

**Date:** 2026-11-20  
**Scope:** Offline migration filename/content validation and regression coverage.

## Defects addressed

- The filename regex checked the 14-digit shape but did not verify that the value represented a real UTC calendar timestamp. Impossible dates such as February 29 in a non-leap year could pass filename validation.
- The previous ordering check sorted versions before comparing them, making the check redundant.
- Uppercase `.SQL` files were silently omitted by a case-sensitive extension filter instead of being explicitly rejected.
- Unexpected directory-read errors previously surfaced as unstructured stack traces.

## Changes

- Enforce lowercase timestamped migration filenames.
- Validate year/month/day/hour/minute/second by UTC round-trip, including leap-day correctness.
- Detect SQL extensions case-insensitively so uppercase variants are rejected rather than ignored.
- Remove the tautological post-sort ordering check.
- Report unexpected migration-directory read errors clearly.
- Add eight dependency-free Node.js regression tests.
- Run both migration-integrity and database-contract test suites in CI.

## Exact-head CI evidence

Head: `332d77d20d221be964ee776d434932a5b16d4ead`

[GitHub Actions run #44656888250](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44656888250)

- Syntax checks: PASS.
- Database contract validator tests: **8 passed, 0 failed**.
- Migration integrity tests: **8 passed, 0 failed**.
- Production safety invariant: PASS.
- Historical migration source check: BLOCKED — `supabase/migrations/` is absent.
- Reviewed contract snapshot check: BLOCKED — `supabase/contracts/database-contract.snapshot.json` is absent.

The remaining BLOCKED results are intentional source-readiness gates. These tests validate checker behavior; they do not recover original migration history or establish live schema parity.

## Safety

All tests use temporary local filesystem fixtures. No production database was accessed or modified. No migration, secret change, merge, or deployment was performed.
