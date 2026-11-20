# Phase 4N.23 — Supabase Client and Authentication Foundation

**Status:** ISOLATED IMPLEMENTATION BRANCH CREATED — dependency installation and application implementation pending
**Date:** 2026-11-20
**Base:** PR #50 exact head `af5511b483760f5593c4cac4b2359c07fdf66bfa`
**Branch:** `eng/phase-4n23-supabase-auth-foundation`

## 1. Objective

Introduce a real, browser-safe Supabase client and authentication lifecycle without changing the production database, weakening RLS, exposing privileged credentials, or presenting demo data as live data.

This phase is deliberately limited to identity and session foundation. It does not implement workflow mutations, production data writes, worker deployment, or release.

## 2. Verified starting point

At the PR #50 base commit:

- The application is Vite + React + TypeScript.
- `@supabase/supabase-js` is not declared in `package.json`.
- `src/lib/supabase/config.ts` and `public-config.ts` already validate public URL/key configuration.
- `src/lib/supabase/database.types.ts` exists as a schema-derived type candidate and must be reconciled with the reviewed database contract before feature queries.
- `.env.example` contains public-only configuration placeholders.
- The application explicitly labels its current interface DEMO MODE.
- CI installs from the committed npm lockfile using Node 22.

Do not infer that an SDK client, AuthProvider, protected route, or live browser data service already exists.

## 3. Dependency gate

Install the official `@supabase/supabase-js` package at an explicitly reviewed exact version using npm in a clean Node 22 environment.

Required sequence:

1. Record `node --version` and `npm --version`.
2. Review the selected package version and dependency/license metadata.
3. Run `npm install --save-exact @supabase/supabase-js@<reviewed-version>`.
4. Commit the generated `package.json` and `package-lock.json` together.
5. Run `npm ci` from a clean checkout.
6. Run `npm audit`, `npm run lint`, `npm test`, `npm run test:edge-function-security`, and `npm run build`.
7. Verify the exact resulting commit SHA in GitHub Actions.

Never hand-edit or synthesize the lockfile. If a writable Node 22 environment is unavailable, stop at this gate rather than creating an un-installable source commit.

## 4. Target source structure

```text
src/
  app/
    AppProviders.tsx
    RequireAuth.tsx
  features/
    auth/
      AuthProvider.tsx
      auth-service.ts
      auth.types.ts
      AuthScreen.tsx
  lib/
    supabase/
      client.ts
      config.ts
      public-config.ts
      database.types.ts
      errors.ts
  tests/
    auth/
      auth-provider.test.tsx
      auth-service.test.ts
      auth-boundary.test.ts
```

Use existing folders and conventions where they already exist; do not create duplicate abstractions merely to match this illustrative tree.

## 5. Security invariants

- Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` may enter browser configuration.
- Never expose `service_role`, `sb_secret_*`, worker shared secrets, webhook secrets, signing keys, or billing credentials.
- Do not log passwords, access tokens, refresh tokens, session objects, or raw authorization headers.
- Browser route guards are UX controls, not authorization boundaries.
- RLS and server-side authorization remain mandatory.
- Derive user identity from the authenticated session; never trust owner IDs from forms, query strings, local storage, or arbitrary client input.
- Clear user-scoped in-memory state on sign-out and account switch.
- Auth callbacks must not perform awaited database operations inline.
- Unconfigured or invalid public configuration must fail closed into an explicit unavailable/demo state; it must not silently imply authentication is active.

## 6. Authentication lifecycle acceptance criteria

- Initial session restoration has an explicit loading state.
- Auth state subscription is installed once and unsubscribed on unmount.
- Anonymous, authenticated, loading, and error states are explicit and typed.
- Sign-in, sign-up, and sign-out expose pending and safe error states.
- Session refresh/expiry and offline failures do not leak provider internals.
- Protected workspace content is never briefly rendered before session resolution.
- Sign-out and account switching clear cached data belonging to the previous user.
- Email-confirmation requirements are represented accurately.
- User-editable metadata is never treated as a role or authorization claim.

## 7. Tests required before connecting real features

### Unit/component

- Missing and malformed environment configuration.
- Publishable key accepted; privileged key rejected.
- Initial session loading prevents protected-content flash.
- Auth listener cleanup on unmount.
- Sign-out clears user-scoped state.
- Account switch cannot display prior-account data.
- Generic user-safe errors and accessible pending/status states.

### Isolated integration

- Synthetic-user sign-in, session restore, refresh, and sign-out.
- Two-user isolation against an isolated Supabase test stack.
- Direct REST access cannot bypass RLS.
- Expired/invalid sessions are rejected.
- No destructive tests against the production project.

### Device/browser

- Android narrow viewport and touch targets.
- Keyboard navigation and focus management.
- Offline recovery and page refresh.
- No credentials or tokens in URLs, console output, or browser-visible diagnostics.

## 8. Explicitly out of scope

This branch does not authorize or include:

- Production schema changes, migrations, grants, or RLS policy changes.
- Production data writes or destructive tests.
- Edge Function deployment or hosted Supabase configuration changes.
- Secret rotation or environment-variable updates.
- Vercel configuration, billing, or deployment changes.
- Merge, promotion, or release.

## 9. Exit gate

Phase 4N.23 may be marked implementation-complete only when the SDK and generated lockfile are committed together, exact-head CI passes, auth lifecycle tests pass, security invariants pass, and a reviewer inspects the final diff.

A green build alone does not prove live Supabase connectivity or production readiness. Live connectivity and two-user RLS isolation require separate, explicit test evidence.

## 10. Current status

| Gate | Status |
|---|---|
| Isolated branch from exact PR #50 head | CREATED |
| Existing public config validation inspected | VERIFIED |
| SDK dependency installation | BLOCKED — writable Node 22 workspace required |
| Lockfile regeneration | BLOCKED — must be generated by npm |
| AuthProvider and session lifecycle | NOT IMPLEMENTED |
| Auth unit/integration tests | NOT IMPLEMENTED |
| Production database changes | NOT PERFORMED |
| Merge/deployment/release | NOT AUTHORIZED |
