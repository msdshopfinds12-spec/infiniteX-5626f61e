# Phase 4N.14 — Contract Validator Hardening

**Date:** 2026-11-20  
**Branch:** `recovery/infinitex-database-source-of-truth`  
**Scope:** Offline validator hardening and regression coverage only.

## Defect found

The original contract snapshot validator checked whether `tables` and `functions` were arrays but then iterated over the supplied values regardless. Malformed snapshots could therefore throw an uncaught `TypeError` instead of producing deterministic validation errors. A JSON `null` root or null array entries could also crash property access.

## Changes

- Validate that the snapshot root is a non-null JSON object before reading properties.
- Iterate tables/functions only when the corresponding value is an array.
- Reject null, primitive, or array entries with indexed error messages.
- Require non-empty string schema/name identifiers.
- Validate optional `identityArguments` and `searchPath` types.
- Validate `executeRoles` as an array of non-empty strings.
- Preserve the SECURITY DEFINER `searchPath` requirement.
- Add dependency-free Node.js built-in test-runner coverage.
- Include the test directory in the workflow path filter and run regression tests before migration/source checks.

## Regression cases

The test suite covers:
1. Missing snapshot fails closed with exit code 2.
2. Valid snapshot passes structural validation.
3. Non-object root is rejected without a crash.
4. Non-array tables/functions are rejected without a TypeError.
5. Null table/function entries are rejected safely.
6. Duplicate table/function identities are rejected.
7. SECURITY DEFINER functions require recorded searchPath.
8. Malformed JSON returns a controlled validation error.

## Exact GitHub Actions evidence

Latest inspected run on head `685799df65703010f107c38205c733082bd0a154`:

- Run: [44656390970](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44656390970)
- JavaScript syntax checks: PASS
- Contract validator regression tests: **8 passed, 0 failed**
- Production safety invariant: PASS
- Migration integrity: BLOCKED because `supabase/migrations/` is absent
- Contract snapshot validation: BLOCKED because `supabase/contracts/database-contract.snapshot.json` is absent

The workflow is expected to remain red until authoritative source files are recovered. This is intentional fail-closed behavior. Do not add fabricated historical migrations or a guessed schema snapshot merely to make CI green.

## Non-actions

No production database was queried or modified. No migrations, secrets, deployments, merges, or branch deletions were performed. The changes are confined to the draft recovery PR.
