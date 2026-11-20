# Phase 4N.8 — Verification, Contract Reconciliation and Release Gate

**Status:** Phase 4N.8A implementation and CI verification complete; broader Phase 4N.8 release gates remain open  
**Base branch:** `main`  
**Working branch:** `fix/phase-4n8a-attempt-fencing` (based on `feat/phase-4n7-workflow-reliability`)  
**Release policy:** no merge, migration, secret change, billing change, or deployment without separate human approval.

## 1. Objective

Turn the Phase 4N.7 implementation from committed source into evidence-backed, release-reviewable software. This phase prioritizes reproducible test execution and contract verification over adding new features.

## 2. Current verified source inventory

- Authenticated workflow worker: `supabase/functions/simula-workflow-worker/index.ts`
- Cron worker: `supabase/functions/simula-workflow-cron-worker/index.ts`
- API-key manager: `supabase/functions/ashaa-api-key-manager/index.ts`
- Exact-origin CORS policy: `supabase/functions/_shared/cors.ts`
- Shared worker security helpers: `supabase/functions/_shared/worker-security.mjs`
- Node tests: `supabase/functions/_shared/worker-security.test.mjs` and `cors.test.mjs`
- Deno tests: `supabase/functions/_shared/worker-security.deno.ts`

Source presence is not proof of runtime correctness.

## 3. Required local/CI verification

Run from the repository root on `fix/phase-4n8a-attempt-fencing` (Deno CLI pinned to 2.2.12 in CI):

```bash
node --version
npm --version
npm run test:edge-function-security
npx --yes deno@2.2.12 --version
npx --yes deno@2.2.12 test --no-lock supabase/functions/_shared/worker-security.deno.ts
npx --yes deno@2.2.12 check --node-modules-dir=auto --no-lock supabase/functions/simula-workflow-worker/index.ts
npx --yes deno@2.2.12 check --node-modules-dir=auto --no-lock supabase/functions/simula-workflow-cron-worker/index.ts
npx --yes deno@2.2.12 check --node-modules-dir=auto --no-lock supabase/functions/ashaa-api-key-manager/index.ts
npm run build
```

Record exact command, runtime version, exit code, timestamp, and unedited output. Do not translate a missing runtime, skipped command, or inaccessible Actions run into PASS.

## 4. Test matrix

| Gate | Required evidence | Pass condition |
|---|---|---|
| Node unit tests | Full test output | All committed tests pass |
| Deno unit tests | Full Deno output | All committed Deno tests pass |
| Deno type checks | Per-function output | All three functions type-check |
| Frontend build | `npm run build` output | Exit code 0 |
| CORS | Exact-origin allow/deny cases | No wildcard or partial-origin acceptance |
| Worker auth | Authenticated and unauthorized cases | Unauthenticated requests rejected |
| Tenant isolation | Schema-backed tests | No cross-owner reads or writes |
| Retry/idempotency | Action-level tests | No unsafe duplicate side effects |
| Request limits | Streamed-byte tests | Oversized payload rejected before parsing/action |
| Timeout semantics | Slow-action tests | Clearly documented cooperative limits; no false hard-timeout claim |

## 5. Contract reconciliation — blocking

Before changing database queries or deploying Edge Functions, locate and inspect authoritative migrations/schema for:

- `workflow_runs`
- `workflows`
- `workflow_steps`
- `workflow_step_runs`
- `workflow_logs`
- `platform_api_keys`
- `simula_claim_workflow_runs`
- `simula_claim_workflow_runs_internal`
- `simula_verify_worker_secret`

Verify primary keys, foreign keys, owner columns, unique constraints, RPC argument names, return shapes, grants, and SECURITY DEFINER/search_path behavior.

**Do not** add guessed columns, indexes, policies, grants, RPC replacements, or migrations. The child-step owner-filter question remains blocked until schema evidence is available.

## 6. Security review checklist

- Confirm service-role credentials are read only from server-side environment variables and never returned to clients.
- Confirm API key material is returned once, stored only as a digest, and excluded from list responses and logs.
- Confirm every API-key mutation is constrained to the authenticated owner.
- Confirm the cron secret is compared only through the existing verification RPC; do not log supplied secrets.
- Confirm CORS allowlist is configured for every intended browser origin before browser use.
- Confirm missing CORS configuration fails closed for browser-origin requests.
- Confirm no client-supplied owner ID is trusted as authorization.
- Confirm status updates and upserts are owner/run scoped using verified schema constraints.
- Confirm external side-effect actions have idempotency keys before retries are ever reintroduced.
- Confirm synchronous timeout checks are described as cooperative, not preemptive.

## 7. GitHub Actions evidence limitation

GitHub Actions evidence is now recorded for the exact Phase 4N.8A head `9d6ac04f2bf5ec4d3765f12468b4a1dd777f0753`:
- Push run [#44597625333](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44597625333): success.
- Pull-request run [#44597796899](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44597796899): success.
- Existing Phase 4N.7 workflow pull-request run [#44597796900](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44597796900): success.

The two Phase 4N.8A runs include 6/6 CORS tests, 10/10 Node worker-security tests, 6/6 Deno tests, Deno type checks for all three Edge Functions, and the application build. This is code-level CI evidence, not a production runtime test.

## 8. Exit criteria

Phase 4N.8 can be marked VERIFIED only when:
1. All required tests and type checks have actual successful outputs.
2. Database and RPC contracts are reconciled against authoritative schema.
3. Tenant-isolation and API-key security behavior are tested.
4. No unresolved critical/high findings remain.
5. Build and CI evidence identify the exact commit SHA.
6. A separate human release approval is recorded.

Until then: **NOT RELEASE READY**.
