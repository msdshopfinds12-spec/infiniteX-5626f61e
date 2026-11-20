# Phase 75 — API-key Permission Migration Rehearsal

**Status:** Isolated PostgreSQL 17 rehearsal added; CI result pending at initial report creation.  
**Migration under test:** `supabase/migrations/20261120120000_harden_platform_api_key_column_access.sql`

## Objective

Verify the exact existing API-key permission migration against a disposable PostgreSQL 17 service before any production migration is considered. The test checks effective table/column grants and confirms the existing owner RLS policies remain enabled and unchanged in count.

## Rehearsal design

- GitHub Actions starts a temporary PostgreSQL 17 service.
- A fixture creates only the roles and table columns needed by the migration.
- Baseline authenticated table-level SELECT/UPDATE grants are applied.
- The checked-in migration is included directly with psql; the test does not copy or rewrite its SQL.
- Assertions inspect effective privileges through PostgreSQL's `has_table_privilege` and `has_column_privilege`.
- The entire rehearsal runs in a transaction and ends with `ROLLBACK`.
- No Supabase connection string, production secret, or user data is used.

## Assertions

1. Authenticated loses table-wide SELECT and UPDATE.
2. Authenticated cannot SELECT `key_hash`.
3. Authenticated retains SELECT on approved non-secret metadata.
4. Authenticated retains UPDATE only on `revoked_at`.
5. Authenticated cannot UPDATE `label` or `key_hash`.
6. Service role's existing SELECT/UPDATE access is not reduced.
7. RLS remains enabled.
8. Existing owner-scoped SELECT and UPDATE policies remain present.

## Files

- `tests/database/phase-75-api-key-permissions-rehearsal.sql`
- `.github/workflows/phase-75-api-key-migration-rehearsal.yml`

## Safety and limits

This is a disposable PostgreSQL fixture, not a clone of the full Supabase project. It validates the migration's grant semantics and RLS-preservation assumptions for the named table. It does not validate every production role membership, default privilege, schema exposure setting, trigger, function, Data API behavior, or application query.

A successful run is necessary but not sufficient for production approval. The next gate is a fuller isolated schema rehearsal and a review of frontend/API queries that may currently depend on table-wide SELECT.

**No production changes:** no live SQL, migration application, GRANT/REVOKE, Edge Function deployment, secret change, merge, or Vercel deployment.

## CI evidence

- Workflow: [Phase 75 API-key Migration Rehearsal](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44820604455)
- Tested commit: `b7d4910e6bc2985a58df3034de94ec7aebef81d7`
- PostgreSQL: `17.12`
- Result: `SUCCESS`
- The exact migration executed successfully; all privilege and RLS assertions passed; transaction ended with `ROLLBACK`.

This confirms the migration's expected grants against the isolated fixture only. The report-only commit that records this result does not change the tested SQL or workflow.
