# InfiniteX Phase 46C — Supabase SDK Integration Gate

**Status:** PARTIAL — dependency resolution experiment passed; application integration is not yet committed.
**Target branch:** `eng/infinitex-p0-p1-auth-2026-11-20`
**Target PR:** #60 (Draft)
**Decision:** Do not wire the SDK into the application until the exact manifest and npm-generated lockfile are committed and verified together.

## 1. Verified starting point

The current branch contains:
- `src/lib/supabase/public-config.ts`: browser-safe URL/key validation; rejects privileged keys and unsafe URL forms.
- `src/lib/supabase/database.types.ts`: generated database type definitions already present.
- `src/features/auth/auth-state.ts`: provider-neutral auth state and identity-epoch fencing.
- `src/features/auth/auth-session-coordinator.ts`: stale initial-session result fencing.
- `src/features/auth/auth-session-provider.tsx`: React provider that subscribes before reading the initial session and cleans up on unmount/adapter replacement.
- `src/main.tsx`: intentionally mounts the existing demo app directly; no live provider is mounted.

The app remains DEMO MODE. No live Supabase auth or data access is claimed.

## 2. SDK resolution evidence

A separate Node 22 npm-resolution experiment produced a candidate package manifest and lockfile:
- Package: `@supabase/supabase-js`
- Resolved package version: `2.119.2`
- Manifest range in the experiment: `^2.0.0`
- Lockfile format: npm lockfile v3
- Candidate package entries: 74
- Reported experiment: `npm ci --ignore-scripts` and `npm audit` passed in the isolated CI experiment.

This evidence proves dependency resolution for that candidate only. It does not prove that the candidate has been installed in this application, that the application compiles against it, or that authentication works.

## 3. Required integration sequence

1. Add an exact, reviewed SDK dependency to `package.json`.
2. Generate the matching lockfile using npm in Node 22. Never hand-edit `package-lock.json`.
3. Commit the manifest and lockfile as one atomic change.
4. Run `npm ci`, `npm audit`, lint, tests, and production build on the exact resulting commit.
5. Add a singleton typed browser client using `createClient<Database>`.
6. Feed only validated `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` values into the browser client. Never use service-role, `sb_secret_*`, worker, or webhook secrets in Vite.
7. Add a narrow SDK adapter that exposes only the authenticated user ID to the provider-neutral session contract.
8. Mount the provider only when public configuration is valid. Missing/invalid configuration must leave the demo app usable and visibly in DEMO MODE.
9. Add adapter tests with synthetic sessions, including initial-session rejection, sign-in, sign-out, account switching, stale callbacks, and unsubscribe behavior.
10. Only after separate approval and isolated test evidence may account-scoped feature services or protected routes be enabled.

## 4. Security invariants

- Browser bundle contains public/publishable credentials only.
- No client-side access to `platform_api_keys.key_hash`; use the reviewed metadata projection.
- Browser clients must not insert workflow-run lifecycle fields directly.
- Workflow creation must use the narrow server-side contract; owner and initial lifecycle state are server-derived.
- Identity-epoch changes invalidate stale account-scoped async results.
- Sign-out and account switch must clear account-scoped client caches before rendering the next account's data.
- No credentials, tokens, session objects, or raw auth errors are written to logs.

## 5. Free-first alternatives

Preferred: official Supabase JavaScript SDK with a committed npm-generated lockfile.

If dependency installation or lockfile generation is blocked:
- Keep the provider-neutral auth state/coordinator and DEMO MODE.
- Continue SDK-independent contract tests and UI accessibility work.
- Do not substitute direct REST calls or hand-written auth token handling; that would increase security and maintenance risk.
- Do not fabricate a lockfile or use a service-role key in the browser.

## 6. Explicitly not done

- No Supabase SDK dependency committed to the application manifest/lockfile.
- No browser client singleton or SDK adapter.
- No provider mount or live auth UI.
- No production database, RLS, migration, Edge Function, secret, environment, or billing changes.
- No merge, deployment, or release.

## 7. Acceptance criteria

Phase 46C is complete only when the exact PR head has:
- matching npm manifest and lockfile;
- successful exact-head `npm ci`, `npm audit`, lint, test, and build logs;
- unit coverage for config gating and SDK adapter mapping;
- evidence that missing configuration preserves DEMO MODE;
- no privileged browser secret exposure;
- documented residual risks and explicit human release approval still pending.

**Release status: NOT APPROVED. Keep PR #60 Draft.**
