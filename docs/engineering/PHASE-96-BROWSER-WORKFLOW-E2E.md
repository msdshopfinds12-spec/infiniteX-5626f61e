# Phase 96 — Browser Workflow Lifecycle E2E

**Base:** `7a30f0ff60a42084c60119fc4820cdd0a68a0fe2` (Phase 95 exact-head CI pass)
**Branch:** `phase-96-browser-workflow-e2e`
**Scope:** Synthetic Chromium browser test, CI wiring and documentation.
**Production migration / deployment / merge:** NOT PERFORMED

## Objective

Validate the user-visible workflow lifecycle in a real browser engine, beyond unit tests and source-contract tests.

## Browser journey

The Playwright test starts a local Vite production preview with synthetic public-only Supabase configuration and intercepts every Supabase request. It uses no real Supabase project, real account, production credentials, external AI provider or live workflow worker.

1. Sign in as a synthetic identity through the actual React authentication UI.
2. Read a synthetic active workflow through the authenticated Supabase client boundary.
3. Open the workflow's run history on a 390 × 844 mobile viewport.
4. Explicitly enqueue one request through the actual browser workflow service and mocked Edge Function HTTP boundary.
5. Return a queued run from the synthetic PostgREST boundary.
6. Return a terminal succeeded state on a later read, exercising Phase 95 polling in Chromium.
7. Assert no direct browser table writes, correct bearer identity, exactly one enqueue call, no uncaught page errors and no horizontal mobile overflow.

## Security properties exercised

- The browser receives only a synthetic `sb_publishable_*` key; no service-role or secret key is configured.
- All Auth, PostgREST and Edge Function requests are intercepted by Playwright.
- Workflow table reads must use the synthetic authenticated bearer token.
- PostgREST write methods are rejected by the test harness; observed table requests must be GET/OPTIONS only.
- The only workflow mutation is the explicit user-initiated Edge Function request.
- The function mock validates workflow ID, JSON input and generated request UUID.
- No production database or external provider is contacted.

## CI

`.github/workflows/phase-96-workflow-browser-e2e.yml` installs Playwright ephemerally without modifying the lockfile, builds the production bundle with synthetic browser-only environment values, starts a loopback-only Vite preview, then executes the Chromium test.

The normal InfiniteX quality-gates workflow is also enabled for this phase branch.

## Verification checklist

- `npm ci`
- `npm audit --audit-level=low`
- `npm run lint`
- `npm test`
- `npm run build`
- Playwright Chromium E2E on the production preview

The final branch HEAD must pass both quality gates and browser E2E. A passing synthetic browser test demonstrates frontend behavior against mocked service boundaries only; it is not proof of production Supabase, deployed Edge Function, Vercel parity, real worker execution or Android hardware compatibility.

## Alternatives considered

1. **Playwright with intercepted service boundaries:** selected; repeatable, free in GitHub-hosted CI, no production secrets, validates real React/browser behavior.
2. **Supabase local stack:** useful for a later database-integrated browser phase, but adds Docker/runtime setup and is unnecessary for this frontend lifecycle gate.
3. **Production Supabase test account:** rejected for this phase because production state and credentials are unnecessary for deterministic browser coverage.
4. **JSDOM-only tests:** retained for component logic, but insufficient for actual browser rendering, navigation, viewport overflow and network boundary behavior.
5. **Realtime subscriptions:** deferred; the current tested polling design is sufficient until production realtime publication and authorization are separately verified.

## Known limitations

- Mobile viewport emulation is not physical Android device testing.
- Synthetic response fixtures do not prove real PostgREST RLS or Edge Function deployment.
- The test intentionally does not invoke a live worker or AI provider.
- No visual-regression baseline or assistive-technology screen-reader session is performed.

## Release gate

No production migrations, Edge Function deployments, secrets, billing, public publishing, PR merge or live provider calls are authorized by this phase.

**Status before CI:** IMPLEMENTED / NOT YET VERIFIED.
**Release status:** NOT APPROVED.
