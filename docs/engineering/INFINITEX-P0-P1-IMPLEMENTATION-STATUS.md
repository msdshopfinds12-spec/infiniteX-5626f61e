# InfiniteX P0/P1 Implementation Status

**Current status:** AUTHENTICATION UX + RECOVERY IMPLEMENTED; PHASE 49 FAIL-CLOSED BOOTSTRAP AND AUTHORIZATION CONTRACT ADDED; CI CONFIRMATION PENDING.
**Branch:** `eng/infinitex-p0-p1-auth-2026-11-20`
**Base:** `eng/infinitex-unified-ui-backend-2026-11-20`
**PR:** #60 — Draft, open, not merged.
**Scope:** source-code and documentation changes only; no production backend mutations or deployment.

## Verified implementation on this branch

1. Exact `@supabase/supabase-js@2.119.2` dependency and npm-generated lockfile.
2. Browser-safe Supabase public configuration validation; privileged service-role and `sb_secret_*` credentials are rejected.
3. Typed Supabase browser client using PKCE and official SDK session handling.
4. Provider-neutral auth state, session event subscription, cleanup, identity epoch, and stale initial-session fencing.
5. Sign-in, sign-up, sign-out, password-reset request, and password-update actions.
6. Responsive authentication and password recovery UI with safe error messages, input validation, and non-enumerating reset response.
7. Recovery mode requires a Supabase `PASSWORD_RECOVERY` event with a non-null session; query-string values alone do not activate recovery.
8. Dashboard remains DEMO MODE; no live workflow, agent, logs, usage, or security telemetry is claimed.
9. Read-only GitHub Actions quality gates run npm install, audit, lint, tests, edge/worker security tests, and production build.
10. Phase 49 adds a fail-closed auth bootstrap resolver and a deny-by-default UI authorization decision contract.

## Phase 49 critical fix

A code review found that missing or invalid Supabase public configuration caused `Root` to render `<App />` without an auth state. Since the App shell previously treated missing state as permission to render the demo workspace, this was a fail-open bootstrap path.

The fix makes missing/invalid configuration produce the generic auth error state and makes `App` itself fail closed if no auth state is supplied. New tests cover the bootstrap resolver.

## Authorization and data boundaries

- The capability decision helper is a client-side UX contract only. It is not server authorization.
- A browser-provided role, permission list, user ID, URL parameter, or local-storage value must never authorize backend access.
- Server handlers must derive the subject from the verified Supabase session and enforce permissions for every operation.
- RLS must enforce row ownership independently.
- Never select `platform_api_keys.key_hash`; use `src/features/security/api-key-metadata.ts`.
- Never perform browser INSERTs into `workflow_runs` or set worker-owned lifecycle/result fields; use a trusted server-side enqueue operation after contract review.
- Billing, credit-ledger mutations, worker claim operations, and privileged operations remain server-side.
- Account-scoped caches must be cleared/fenced on sign-out and account switch before live user data is introduced.

## Verification evidence and limitations

Earlier exact-head Phase 48 verification passed:
- 100 unit/regression tests.
- 8 Edge Function CORS tests.
- 10 worker security tests.
- npm audit: 0 vulnerabilities.
- lint and production build passed.

Phase 49 adds new source and tests. Its final exact-head CI status is pending until the new commit completes all workflow jobs. Do not reuse earlier Phase 48 results as proof of Phase 49 verification.

Live Supabase recovery email delivery, redirect allow-list, synthetic-account RLS isolation, cross-user negative tests, live server authorization, and production data access are NOT VERIFIED.

## Explicit safety boundaries

- No production DDL, DML, GRANT/REVOKE, RLS policy, migration, Edge Function deployment, secret update, environment change, or billing change.
- No merge, release, or manual deployment.
- Automatic Vercel Git integration may create deployment records on branch pushes; this is distinct from a manually approved production deployment. Vercel build-rate-limit/verified-commit blockers remain separate from GitHub Actions CI.

**Release status: NOT APPROVED. Keep PR #60 Draft.**
