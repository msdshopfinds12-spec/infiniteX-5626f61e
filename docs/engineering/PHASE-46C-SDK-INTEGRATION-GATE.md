# InfiniteX Phase 46C — Supabase SDK and Auth Adapter

**Status:** PARTIAL — exact SDK dependency is committed and verified; typed browser client/session adapter is wired; sign-in UI and backend data access remain out of scope.
**Target branch:** `eng/infinitex-p0-p1-auth-2026-11-20`
**Target PR:** #60 (Draft)
**Dependency commit:** `f0fd57fd8aea8c50d4a2c0061f27e33a11676a2e`

## 1. Verified dependency gate

- `@supabase/supabase-js` is pinned exactly to `2.119.2` in `package.json`.
- `package-lock.json` resolves the root dependency and SDK package to `2.119.2`.
- The dependency manifest and lockfile were committed together in one commit.
- Exact-head CI run `44697587720` passed clean install, audit, lint, regression tests, and production build.

This verifies dependency installation and build compatibility at that commit. It does not prove live credentials, auth redirects, email delivery, RLS isolation, or production data access.

## 2. Browser client and session adapter

- `src/lib/supabase/client.ts` creates a typed `SupabaseClient<Database>` only after public URL/key validation.
- Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are accepted. Never expose service-role, `sb_secret_*`, worker, webhook, or billing secrets through Vite.
- Auth is configured for persistent browser sessions, automatic token refresh, URL callback detection, and PKCE.
- `src/features/auth/supabase-auth-session-adapter.ts` maps the SDK session to only `{ user: { id } }`. Tokens and raw session objects are not placed in React state.
- Missing or invalid public configuration keeps the application in DEMO MODE and does not create a Supabase client.
- The React provider is mounted only when the validated client is available.
- The dashboard remains explicitly demo-only even when an auth session is detected. No live feature data services or sign-in forms are enabled in this phase.

## 3. Security invariants

- React route guards are UX controls only; RLS and server-side authorization remain the security boundary.
- Never accept an owner/user ID from a form, URL, local storage, or client state as an authorization input.
- Never select `platform_api_keys.key_hash`; use the reviewed safe-column projection.
- Do not create workflow runs directly from the browser or set worker-owned lifecycle/output fields.
- Account switch and sign-out must invalidate identity-epoch-scoped work and clear account-scoped caches before rendering another account's data.
- Never log access tokens, refresh tokens, full session objects, or raw auth errors.

## 4. Test and release gate

The adapter tests use synthetic session data and cover:
- SDK session-to-identity mapping;
- missing session / anonymous mapping;
- rejected session reads;
- auth-event mapping;
- subscription cleanup.

The resulting exact PR head must pass:
- `npm ci`
- `npm audit`
- `npm run lint`
- `npm test`
- `npm run build`

A separate test against isolated synthetic Supabase accounts is required before any RLS-backed feature is enabled. Do not use production accounts or production data for destructive or negative tests.

## 5. Free-first alternatives

Preferred: official Supabase SDK with a typed, narrow adapter.

If live credentials or backend integration is unavailable:
- Keep the provider-neutral auth contract and DEMO MODE.
- Continue UI accessibility and isolated unit tests.
- Do not replace the official SDK with hand-written token storage or custom auth REST calls.
- Do not use a service-role key in a browser build.

## 6. Explicitly not done

- No sign-in/sign-up/password-reset UI or OAuth callback screen.
- No protected routes or account-scoped data services.
- No live RLS isolation test using synthetic Supabase users.
- No production schema, RLS, migration, Edge Function, secret, environment, or billing changes.
- No merge, deployment, or release.

**Release status: NOT APPROVED. Keep PR #60 Draft.**
