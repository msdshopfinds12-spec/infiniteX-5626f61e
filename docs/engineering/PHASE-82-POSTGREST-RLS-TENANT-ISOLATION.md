# Phase 82 — PostgREST RLS Tenant Isolation

**Status:** VERIFIED IN DISPOSABLE CI / DRAFT PR OPEN  
**Base:** `phase-81/postgrest-worker-http-integration`  
**Scope:** Disposable PostgreSQL 17 + standalone PostgREST + synthetic JWTs only

## Objective

Verify that authenticated PostgREST requests are constrained by the checked-in database grants, RLS policies, and row triggers for two independent synthetic users. This phase does not change production schema, grants, policies, secrets, or data.

## Coverage

- Tenant A and tenant B each read exactly their own `user_projects` row.
- Tenant A cannot update tenant B's project; the filtered update must affect zero rows.
- Tenant A cannot insert a project with tenant B's `user_id`; the RLS WITH CHECK boundary must reject it.
- Tenant A sees only its own API-key metadata.
- The authenticated role cannot select `platform_api_keys.key_hash`.
- Tenant A cannot read tenant B's profile or workflow run.
- Tenant B cannot read tenant A's project.
- Both tenant fixture rows remain unchanged after the negative-path checks.

The fixture uses deterministic synthetic IDs and non-usable hash strings. It is loaded only into the disposable `infinitex_rehearsal` database by the Phase 81 harness. JWTs are short-lived, signed with a test-only secret, and never sent to the live Supabase project.

## Verified CI result

- Phase 82 run [44829120986](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44829120986): **SUCCESS**
- Exact tested commit: `3637a7f345c54deb747e3fe51ce84ed0b64fda20`
- Phase 82 Deno type-check: passed.
- Phase 81 worker HTTP → PostgREST → PostgreSQL journey: passed in the same workflow.
- Tenant A/B own-row visibility and cross-tenant denial assertions: passed.
- API-key safe metadata projection and secret-column denial: passed (PostgREST returns HTTP 403 for the forbidden `key_hash` projection).
- Disposable service log collection and unconditional container cleanup: passed.
- Supporting gates on the same commit: Phase 80 test-source type safety [44829120903](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44829120903) and Phase 68 PostgreSQL replay/security [44829120984](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44829120984): **SUCCESS**.

The first Phase 82 attempt correctly exposed the database's actual HTTP permission-denied status as 403 rather than the test's initially assumed 400. The test expectation was corrected to the observed PostgREST behavior; no production grant or policy was relaxed.

## Security boundaries

- No live Supabase Auth / GoTrue is started; the test uses locally signed JWTs accepted by the disposable PostgREST gateway.
- No live project is contacted.
- No production migration, GRANT/REVOKE, RLS change, or Edge Function deployment is included.
- No PR merge, Vercel deployment, or production release is authorized by this phase.
- This is a verification harness, not proof that every application endpoint is safe. Future phases must cover remaining tables, RPCs, and privileged worker boundaries.

## Next

Phase 83 should perform a source-backed frontend service audit: enumerate every browser query/mutation, verify safe projections and owner derivation, remove direct browser writes to worker-owned fields, and add contract tests. Any live database remediation remains a separate proposal requiring explicit human approval.
