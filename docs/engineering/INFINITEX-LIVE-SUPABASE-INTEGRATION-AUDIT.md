# InfiniteX — Live Supabase Integration and Release-Gate Audit

**Audit date:** 2026-11-20  
**Scope:** Read-only inspection of PR #50 head, connected Supabase project `Ashaa-INX`, live public-schema metadata, RLS policies, column/table grants, Edge Function metadata/source, migrations, and Supabase advisors.  
**Project ref:** `vepacoemkhudamfaccah`  
**PR:** #50 — Draft; not merged.  
**No database writes, migrations, function deployments, secret changes, merges, or production releases were performed.

## 1. Executive decision

**Release status: BLOCKED — do not label production-ready.**

The connected Supabase project is `ACTIVE_HEALTHY` (PostgreSQL 17, region `ap-northeast-2`). The live schema and three active Edge Functions provide a meaningful backend foundation. The frontend in PR #50 remains explicitly DEMO MODE and `package.json` does not include `@supabase/supabase-js`. Therefore, the React application is not yet connected to Supabase Auth or the live data services.

The correct next step is not a broad UI rewrite or an unreviewed schema migration. First reconcile deployed Edge Function source with repository candidates, resolve the CORS and authorization review items below, then install the official SDK in a real Node 22 environment and implement a narrow, typed, read-only authenticated frontend slice.

## 2. Verified live backend inventory

### Project and schema

- Project status: `ACTIVE_HEALTHY`.
- Database engine: PostgreSQL 17.
- Live public schema: 14 tables; all 14 report RLS enabled.
- Live migrations include core schema/RLS, workflow scheduling and queue claiming, worker secret/Vault hardening, stale-run recovery, table privilege restrictions, API-key/webhook idempotency, and credit ledger.
- The checked-in `src/lib/supabase/database.types.ts` is a generated schema snapshot. It does not prove frontend SDK integration or runtime authorization.

### Tables

`profiles`, `tools`, `user_projects`, `usage_logs`, `subscriptions`, `payments`, `workflows`, `workflow_steps`, `workflow_runs`, `workflow_step_runs`, `workflow_logs`, `platform_api_keys`, `billing_webhook_events`, and `credit_ledger`.

### RLS policy observations

Observed owner-scoped policies exist for profiles, projects, usage, subscriptions, payments, credit ledger, workflows, workflow steps, workflow runs, workflow step runs, workflow logs, and API-key metadata. Active tools have an authenticated read policy. Policy metadata must still be tested using two synthetic users; policy presence alone is not an isolation test.

- `profiles`: authenticated users can select their own profile; UPDATE policy is owner-scoped. Column grants observed allow updates to `display_name` and `avatar_url`, but not `role`, `id`, or timestamps. This is an important least-privilege safeguard; preserve it in future migrations.
- `workflows`: owner-scoped ALL policy; authenticated column grants permit create/update under RLS.
- `workflow_runs`: authenticated INSERT and SELECT only in observed grants; no authenticated UPDATE grant was listed. Worker/server paths own run-state transitions.
- `workflow_step_runs` and `workflow_logs`: authenticated SELECT policies are owner-scoped; no authenticated write grants were listed.
- `platform_api_keys`: owner-scoped SELECT and UPDATE policies exist; the deployed Edge Function handles create/list/revoke actions with an authenticated user check and owner filter. The observed authenticated SELECT grants include `key_hash`; review whether this digest column can be excluded from direct client reads as a least-privilege improvement.
- `billing_webhook_events`: RLS enabled, no policies, and no `anon` or `authenticated` table privileges were returned by the read-only grant query. This appears consistent with a server-only webhook ledger, but preserve server-only access and do not add a client policy.

## 3. Active deployed Edge Functions

| Function | Status | JWT verification | Notes |
|---|---|---:|---|
| `ashaa-api-key-manager` | ACTIVE v1 | true | Authenticates bearer token with `auth.getUser`; service-role operations are owner-filtered; stores SHA-256 digest and returns raw key once. |
| `simula-workflow-worker` | ACTIVE v1 | true | Validates user token and claims runs through authenticated RPC; uses service role for worker writes. |
| `simula-workflow-cron-worker` | ACTIVE v1 | false | Requires custom worker-secret header and validates it through `simula_verify_worker_secret`; server-to-server worker. |

### Deployed-source discrepancy: CORS

The inspected deployed `ashaa-api-key-manager` and `simula-workflow-worker` sources return `Access-Control-Allow-Origin: *`. This differs from the PR #50 stated goal of reconciling exact-origin CORS. A bearer-token check is still required, so wildcard CORS is not by itself proof of account compromise; however, it broadens which browser origins can attempt authenticated cross-origin calls and is not an acceptable final production posture for these authenticated endpoints.

**Required before release:** define the exact production and preview origin allowlist, validate the incoming `Origin` against it, return the matched origin (not `*`), add `Vary: Origin`, and test OPTIONS/preflight, missing Origin, disallowed Origin, and authorization failures. Do not deploy this change until the actual frontend origins and preview strategy are agreed and the deployed function candidate has passed review.

The cron worker is a machine endpoint protected by a server-side secret check; keep that secret out of browser code and do not add it to Vite `VITE_*` variables.

## 4. Supabase Advisor observations

### Security

One INFO-level finding: `public.billing_webhook_events` has RLS enabled but no policies. The read-only grant query also returned no `anon` or `authenticated` table privileges for this table. Treat it as intentionally server-only unless the backend owner confirms a different design. Do not create a broad policy just to silence the lint.

### Performance

Six INFO-level unused-index findings were returned for:
- `user_projects_tool_id_fkey_idx`
- `usage_logs_tool_id_fkey_idx`
- `payments_subscription_id_fkey_idx`
- `platform_api_keys_owner_created_idx`
- `billing_webhook_events_status_received_idx`
- `credit_ledger_owner_created_idx`

**Do not drop these indexes based on the advisor alone.** The project may have low or recently reset usage. Compare query plans, table growth, workload patterns, and foreign-key/delete/update behavior first. Several indexes may support integrity or future operational queries even if current usage counters are low.

## 5. Frontend integration gap

Verified from PR #50 source:

- React/Vite app deliberately displays a DEMO MODE notice.
- Overview metrics are illustrative placeholders, not telemetry.
- Agent list, pipeline board, and logs are sample/static content.
- Search, pipeline creation and execution controls are disabled.
- Security view explicitly states that backend controls are not verified by the demo.
- `package.json` currently has React, Vite, TypeScript, Lucide, and Vercel Analytics, but no `@supabase/supabase-js`.
- The official SDK must be added through npm in a real Node 22 environment. Never hand-author a lockfile or claim an SDK install based only on a package manifest edit.

## 6. Safe implementation sequence

### Gate A — backend contract and source reconciliation

1. Compare the three deployed Edge Function sources with the canonical PR #50 candidate and record exact differences.
2. Confirm production and preview browser origins.
3. Reconcile CORS allowlist in source and regression tests.
4. Review API-key digest visibility and retain the server-only webhook ledger.
5. Run Supabase security and performance advisors again after any approved change.

### Gate B — frontend SDK and typed read-only slice

1. In a real Node 22 environment, install a pinned `@supabase/supabase-js` version and generate `package-lock.json` with npm.
2. Run `npm ci`, lint, unit tests, and production build.
3. Implement one typed client using the generated `Database` type and validated public environment configuration.
4. Add an AuthProvider with session restoration, sign-in/sign-out, auth-state subscription, cleanup on account switch, and safe error states.
5. Start with read-only `profiles`, `workflows`, `workflow_runs`, and `workflow_logs` services. Avoid billing, credits, API-key creation, and workflow mutation in the first integration slice.
6. Keep the app in an explicit demo state when public configuration is absent; never silently mix demo records with live records.

### Gate C — authorization and integration tests

1. Use two synthetic test users (A and B).
2. Verify A can read only A-owned records and B can read only B-owned records.
3. Verify cross-user select, update, delete, and guessed-ID access is denied.
4. Verify a normal user cannot change profile role, billing records, credit ledger, worker secrets, or workflow execution state.
5. Verify API-key raw values are only returned once by the authenticated Edge Function; never log raw keys.
6. Test expired sessions, sign-out, account switching, network failure, empty data, and retry behavior.

### Gate D — release

1. Exact-head GitHub Actions must pass after all changes.
2. Review deployed Edge Function parity and RLS evidence.
3. Complete Android viewport, keyboard, accessibility, and browser QA.
4. Resolve Vercel deployment quota through the supported quota window or an explicitly approved plan; do not bypass verified-commit protection.
5. Require human approval before migrations, function deployment, secret changes, PR merge, or production release.

## 7. Explicitly not done

- No Supabase migration or SQL mutation.
- No Edge Function deployment or secret change.
- No SDK install or lockfile generation.
- No frontend auth/session integration.
- No live data writes or two-user RLS test.
- No PR merge or Vercel production deployment.

**Release conclusion:** The live backend is active and has meaningful security foundations, but InfiniteX remains a demo-oriented frontend with pending integration and deployment gates. The next safe milestone is a verified, typed, read-only authenticated workflow dashboard—not a claim of complete production release.
