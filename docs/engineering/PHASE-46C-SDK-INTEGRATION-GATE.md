# InfiniteX Phase 46C — Supabase SDK and Auth Adapter

**Status:** SDK, sign-in/sign-up, and password recovery UX are implemented with automated CI verification. Live provider configuration, OAuth/MFA, RLS isolation, and production data access remain pending.
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

- OAuth providers and MFA are not configured; password recovery is implemented in Phase 48 but not live-tested.
- No protected routes or account-scoped data services.
- No live RLS isolation test using synthetic Supabase users.
- No production schema, RLS, migration, Edge Function, secret, environment, or billing changes.
- No merge, deployment, or release.

**Release status: NOT APPROVED. Keep PR #60 Draft.**


## 7. Phase 47 — Authentication UX implementation

**Status:** IMPLEMENTED; automated quality gates passed on commit `b921c94d9d5bca7e88e7b684a717baea872a8dec`.

Implemented on the same Draft PR:
- Responsive sign-in and sign-up screen with accessible labels, keyboard focus, loading, success, and error states.
- Email normalization and syntax/length validation.
- Sign-up password minimum of 8 characters and maximum of 128 characters.
- Existing sign-in passwords are not forced through the new-account minimum-length rule.
- Password confirmation for account creation.
- Typed `AuthActions` contract for sign-in, sign-up, and sign-out.
- Supabase error mapping to safe, non-enumerating user messages; raw provider messages are not rendered or logged.
- Session-gated dashboard: anonymous users see the auth screen; loading/error states fail closed; authenticated users may sign out.
- Dashboard content remains demo-only after sign-in. Authentication does not grant access to any unverified data service.
- A read-only GitHub Actions quality-gate workflow runs install, audit, lint, tests, edge/worker security tests, and production build.

### Phase 47 verification evidence

Workflow: [InfiniteX Quality Gates run 3](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44698961302)

Exact tested commit: `b921c94d9d5bca7e88e7b684a717baea872a8dec`

- `npm ci`: PASS — 43 packages installed; 44 audited.
- `npm audit --audit-level=low`: PASS — 0 vulnerabilities.
- `npm run lint`: PASS.
- `npm test`: PASS — 92 tests, 0 failures.
- `npm run test:edge-function-security`: PASS — 8 CORS tests and 10 worker security tests.
- `npm run build`: PASS — Vite transformed 1,616 modules and generated the production bundle.
- Node emitted a non-blocking dependency `url.parse()` deprecation warning; no test, audit, lint, or build failure resulted.

### Phase 47 known limitations / next gates

- Password recovery is intentionally not exposed until the PASSWORD_RECOVERY callback and password-update flow can be implemented and tested end-to-end.
- OAuth providers and MFA are not configured.
- No CAPTCHA or custom anti-abuse integration is enabled; Supabase Auth rate limits remain provider configuration.
- No live Supabase test account or production credential was used.
- No RLS-backed data query, production database mutation, schema migration, Edge Function deployment, Vercel deployment, or release was performed.
- The Vercel build status contexts still report a build-rate-limit failure; the successful GitHub Actions build is separate evidence and does not clear those Vercel contexts.

**Phase 47 release status:** Code and CI verified; live provider integration and security acceptance remain pending. PR #60 stays Draft.


### Phase 47 follow-up hardening — latest exact-head verification

A first quality run found a malformed synthetic test client fixture (the fixture omitted the SDK client's `auth` property wrapper). The fixture was corrected; the production adapter contract was not weakened.

Additional hardening:
- Sign-in, sign-up, and sign-out now normalize both returned SDK errors and thrown network/provider exceptions.
- Sign-out exceptions are converted into safe action results instead of escaping as unhandled UI errors.
- A regression test verifies network exception normalization without rendering internal provider details.
- A regression test verifies sign-out exceptions remain contained.
- Existing sign-in accepts legacy passwords shorter than the new-account minimum; sign-up retains the 8-character minimum and 128-character maximum.

Latest exact tested commit: `8b31883e9a637f59f33c370ea6b1fc576a96065f`.

Latest GitHub Actions evidence:
- [InfiniteX Quality Gates run](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44699196931): SUCCESS.
- [InfiniteX dependency/build verification](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44699205488): SUCCESS; production build artifact uploaded to Actions storage only.

Latest measured results:
- `npm ci`: PASS — 43 packages installed; 44 audited.
- `npm audit`: PASS — 0 vulnerabilities.
- `npm run lint`: PASS.
- `npm test`: PASS — 94 passed, 0 failed.
- Edge Function CORS tests: PASS — 8 passed.
- Worker security tests: PASS — 10 passed.
- `npm run build`: PASS — 1,616 modules transformed.
- No Vercel deployment was triggered by this verification workflow.

The following documentation-only commit is not the exact source-tested commit; any subsequent source changes must trigger these checks again. Vercel build-rate-limit contexts remain independent failures and are not represented as cleared.


## 8. Phase 48 — Password recovery and session hardening

**Status:** IMPLEMENTED; exact-head automated quality gates passed. Live email delivery and callback acceptance remain unverified.

### Implementation

- Added a typed `requestPasswordReset(email, redirectTo)` action using the official Supabase SDK `resetPasswordForEmail`.
- Recovery requests return a non-enumerating success message whether or not the email belongs to an account.
- Added a same-origin recovery redirect builder. It accepts HTTPS origins and localhost development only; production UI derives the origin from `window.location.origin`, not user input.
- The redirect is `/?auth=recovery`; the Supabase SDK uses its configured PKCE flow and URL callback detection to process the code.
- The adapter forwards the SDK `PASSWORD_RECOVERY` event to the provider-neutral session layer.
- Recovery mode is enabled only when the SDK emits `PASSWORD_RECOVERY` with a non-null session. A query-string value alone never authorizes recovery mode.
- Added a password update action using `auth.updateUser({ password })`.
- Added a recovery screen with new-password confirmation, 8–128 character validation, safe error handling, and an explicit sign-out transition back to normal sign-in after success.
- Recovery mode remains active after `USER_UPDATED`; only a verified `SIGNED_OUT` event clears recovery mode.
- Added regression coverage for recovery redirect validation, non-enumerating reset responses, safe provider error mapping, password updates, and recovery event propagation.

### Security properties

- No password, recovery code, access token, or refresh token is copied into application state or logs.
- The application does not parse, store, or manually exchange the PKCE code; the official SDK owns callback processing.
- The recovery screen is not enabled by `?auth=recovery` alone; it requires the SDK's authenticated recovery event and session.
- Password reset UI does not reveal whether an account exists.
- The recovery redirect must be explicitly allow-listed in the Supabase Auth URL Configuration. This setting has not been changed by this work.
- Live email delivery, redirect allow-list acceptance, expiry/replay behavior, and end-to-end recovery are NOT TESTED.

### Exact-head verification

The first Phase 48 test run exposed a pre-existing malformed email-validation regex after the auth helper was expanded. The test caught it; the regex was corrected from an over-escaped pattern to the intended whitespace matcher before the successful run.

Successful source verification at commit `1c9dbf5e9cc39f9034b67a9070305887c5cc9924`:
- [InfiniteX Quality Gates run](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44700126775): SUCCESS.
- `npm ci`: PASS — 43 packages installed; 44 audited.
- `npm audit`: PASS — 0 vulnerabilities.
- `npm run lint`: PASS.
- `npm test`: PASS — 100 passed, 0 failed.
- Edge Function CORS tests: PASS — 8 passed.
- Worker security tests: PASS — 10 passed.
- `npm run build`: PASS — 1,617 modules transformed.

The subsequent fail-closed recovery-session guard and this documentation update require their own exact-head CI confirmation. No production Supabase settings, secrets, database, migration, deployment, or release were changed.


### Final Phase 48 exact PR-head confirmation

The fail-closed recovery-session guard and documentation were subsequently included in PR head `b9dc002447d2824ea3ffb8409f91ddae1d6e73c8`.

- [Final-head InfiniteX Quality Gates](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44700265609): SUCCESS.
- [Final-head dependency/build verification](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44700267874): SUCCESS.
- [Final-head SDK lockfile verification](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44700267878): SUCCESS.

Final-head measured results remain: 100/100 unit and regression tests; 8/8 Edge Function CORS tests; 10/10 worker security tests; zero npm audit vulnerabilities; lint PASS; production build PASS (1,617 modules). No source changes occurred after this tested head at the time of this record.
