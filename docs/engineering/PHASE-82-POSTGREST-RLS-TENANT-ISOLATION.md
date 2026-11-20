# Phase 82 — PostgREST RLS Tenant Isolation

**Status:** IMPLEMENTED IN AN ISOLATED CANDIDATE / CI VERIFICATION PENDING  
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

## Verification

The Phase 82 workflow first reruns the Phase 81 real worker HTTP → PostgREST → PostgreSQL integration, then runs the new direct authenticated PostgREST RLS checks against the same disposable services.

Required final evidence:
1. `deno check` passes for the Phase 82 test.
2. Phase 81 worker HTTP integration still passes.
3. All two-tenant PostgREST assertions pass.
4. Unconditional cleanup removes both disposable containers.

CI status is pending until GitHub reports a terminal result. Do not infer success from queued or in-progress jobs.

## Security boundaries

- No live Supabase Auth / GoTrue is started; the test uses locally signed JWTs accepted by the disposable PostgREST gateway.
- No live project is contacted.
- No production migration, GRANT/REVOKE, RLS change, or Edge Function deployment is included.
- No PR merge, Vercel deployment, or production release is authorized by this phase.
- This is a verification harness, not proof that every application endpoint is safe. Future phases must cover remaining tables, RPCs, and privileged worker boundaries.

## Next

Phase 83 should perform a source-backed frontend service audit: enumerate every browser query/mutation, verify safe projections and owner derivation, remove direct browser writes to worker-owned fields, and add contract tests. Any live database remediation remains a separate proposal requiring explicit human approval.
