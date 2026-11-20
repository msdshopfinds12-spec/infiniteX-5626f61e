# InfiniteX Frontend-to-Supabase Integration Plan

**Status:** PARTIAL — Supabase SDK/auth foundation and read-only workflow list implemented; broader live data integration and environment verification remain incomplete  
**Date:** 2026-11-21  
**Base candidate:** PR #50  
**Live project:** Ashaa-INX (`vepacoemkhudamfaccah`)

## 0. Current verified implementation (2026-11-21)

This plan began as a demo-to-Supabase implementation proposal. The isolated Phase 71–72 branch has since implemented the following source-level capabilities:

- `@supabase/supabase-js@2.119.2` is declared in `package.json` and the npm lockfile is committed.
- `createBrowserSupabaseClient` validates public URL/publishable-key configuration and fails closed when configuration is missing or invalid.
- Supabase Auth session adapter, auth-state coordinator, React provider, sign-in/sign-up/recovery/sign-out flows, and related tests exist.
- `createWorkflowReadService` provides bounded, read-only workflow, run-history, and event-log queries with explicit safe-column projections and no caller-supplied owner ID.
- The Pipelines view renders an authenticated, identity-fenced workflow list with expandable run history and event timeline, loading, empty, error, retry, and search states. Run history excludes input/output/raw error text; event logs exclude the JSON `details` payload.
- Overview metrics, agent cards, sample logs, workflow execution/mutations, and security posture remain demo or unverified.
- GitHub Actions run #44805498658 and disposable PostgreSQL run #44805508557 passed on exact head `060c0516f9d3d3964e1c292b8c856f026083f3c6`.

These results verify source behavior and isolated CI. They do not prove that a browser session has successfully queried the intended live Supabase project, that two-user browser RLS tests have passed, or that production deployment is ready.

## 1. Goal

Replace the demo-only React workspace with an authenticated, owner-scoped application without changing the existing production database schema or weakening current RLS controls.

The current app is Vite + React + TypeScript. The current `src/main.tsx` renders `App` directly; `App.tsx` explicitly declares DEMO MODE and uses illustrative static metrics and sample agent/pipeline/log components.

## 2. Verified backend contract

The live database has 19 migration records and these relevant tables:

- `profiles`
- `user_projects`
- `workflows`
- `workflow_steps`
- `workflow_runs`
- `workflow_step_runs`
- `workflow_logs`

The live schema has owner-scoped RLS policies for the core user-owned resources. The exact live column contract must be represented in generated TypeScript database types before adding queries. Do not infer or invent fields from UI labels.

Relevant live worker RPCs include `public.simula_claim_workflow_runs`, `public.simula_claim_workflow_runs_internal`, and `public.simula_verify_worker_secret`. These are worker contracts, not browser-facing admin APIs. The browser must not call internal worker routines or receive worker secrets.

## 3. Dependency decision

Use the official `@supabase/supabase-js` client. The reviewed Node 22 / npm 10.9.9 workflow resolved v2.119.2. The exact version is now declared in `package.json` with a matching committed npm lockfile and is imported by the typed browser client and auth adapter.

Do not hand-edit `package-lock.json`. Generate it using npm in a clean Node 22 environment, then run `npm ci`, `npm audit`, lint, tests, and build. The repository currently uses Node 22 in CI.

The dependency and lockfile are present on the isolated Phase 71–72 branch. Exact-head CI has run `npm ci`, unit/regression tests, lint, and production build successfully. Any future dependency change must regenerate the lockfile with npm and pass the same gates; never hand-edit lockfile metadata.

## 4. Environment contract

Add only public browser configuration:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Add `.env.example` with empty values and a clear warning. Validate both values at startup. Require HTTPS except for explicitly local development. Do not log keys or session tokens.

Never add any of the following to Vite variables or browser source:

- Supabase `service_role` key
- Supabase secret key (`sb_secret_...`)
- worker shared secret
- billing webhook secret
- API-key hashing or signing secret

Vite variables are compiled into public browser assets. A publishable key is intentionally public and is safe only when paired with correct RLS and server-side authorization.

## 5. Proposed source architecture

```text
src/
  app/
    AppProviders.tsx
    route-guards.tsx
  features/
    auth/
      AuthProvider.tsx
      AuthScreen.tsx
      auth-service.ts
      auth.types.ts
    dashboard/
      dashboard-service.ts
      dashboard.types.ts
    workflows/
      workflow-service.ts
      workflow.types.ts
  lib/
    env.ts
    supabase/
      client.ts
      database.types.ts
      errors.ts
  components/
    auth/
      RequireAuth.tsx
```

Responsibilities:

- `env.ts`: validate URL and publishable key; fail closed if missing or malformed.
- `client.ts`: create exactly one browser Supabase client; no privileged credentials.
- `AuthProvider.tsx`: restore session, subscribe to auth changes, unsubscribe on unmount, expose explicit loading/authenticated/anonymous/error states.
- `RequireAuth.tsx`: protect application views; render a loading boundary while session restoration is pending.
- `AuthScreen.tsx`: accessible sign-in/sign-up form, validation, pending state, generic safe errors, and no credential logging.
- Feature services: use the authenticated client and least-privilege table selects; never accept arbitrary owner IDs from the UI.
- UI components: receive typed view models and explicit loading/empty/error states; do not contain direct raw SQL or privileged operations.

## 6. Authentication lifecycle requirements

1. On app startup, resolve the current session before rendering protected workspace content.
2. Subscribe to `supabase.auth.onAuthStateChange` and clean up the subscription.
3. Avoid async database calls directly inside the auth callback. Capture the event/session and schedule state updates safely outside the callback.
4. On sign-out, clear user-specific query/cache state and return to the auth screen.
5. On user change, clear prior user's in-memory feature data before loading the next user's data.
6. Handle expired sessions, refresh errors, offline states, email-confirmation requirements, and rate limiting without exposing raw provider internals.
7. Never use user-editable `user_metadata` as an authorization source.
8. Browser-side route guards improve UX only. RLS and server-side checks remain the actual security boundary.

## 7. Data access contract

Start read-only:

- Profile: select only the current user's profile row using the verified primary key contract.
- Workflows: select only fields confirmed by live schema and required by the UI.
- Runs: query only the current user's permitted run records.
- Logs: query only permitted owner-scoped logs and paginate with a bounded page size.
- Steps: read steps through the verified workflow ownership relationship.

Do not enable create/update/delete actions until the exact table constraints, defaults, RLS `WITH CHECK` rules, and intended business behavior are documented and tested.

Never trust a user ID supplied by a form, URL, local storage, or client state. Derive identity from the authenticated session and let RLS enforce row ownership.

## 8. UI state model

Every live feature must model:

- `loading`
- `ready`
- `empty`
- `error`
- `offline`
- `unauthenticated`

Remove demo numbers from any live-looking KPI. Until live telemetry exists, show “Not connected” rather than fabricated zeros or sample counts. Preserve an explicitly labeled demo mode only when the user intentionally selects it.

## 9. Required tests

### Unit and component tests

- Missing environment variables fail closed.
- Malformed URL and non-HTTPS production URL are rejected.
- Publishable key is accepted; service/secret key patterns are rejected.
- Auth loading does not briefly render protected data.
- Auth state subscription is cleaned up.
- Sign-out clears all user-scoped in-memory state.
- Account switch cannot display previous user's data.
- Empty/error/offline states render accessible status messages.

### Integration tests against isolated test infrastructure

- Sign-in and sign-out lifecycle.
- Session restoration and refresh.
- User A cannot read User B's workflows, runs, steps, logs, or profile.
- Direct REST requests cannot bypass RLS.
- Expired/invalid tokens are rejected.
- Rate limits and network failures do not expose sensitive provider responses.

Do not run destructive tests against the live project. Use synthetic accounts and an isolated local/test database.

### Browser and device QA

- Keyboard-only login and navigation.
- Screen-reader labels and focus management.
- Android narrow viewport, orientation changes, and touch targets.
- Slow network, offline recovery, refresh, and back navigation.
- No token, password, or secret in console logs or URL query strings.

## 10. Implementation order

1. Create a clean Node 22 workspace from the current PR #60 implementation branch.
2. Install pinned `@supabase/supabase-js` and regenerate lockfile.
3. Add env validation and typed client factory.
4. Add AuthProvider and auth screen.
5. Add protected application shell and account switch/sign-out cleanup.
6. Generate/verify database types from the live schema without changing schema.
7. Add read-only profile/workflow/run/log services one at a time.
8. Replace demo UI only after each feature passes tests.
9. Add isolated RLS integration tests and browser QA.
10. Update the PR with exact-head CI evidence.

## 11. Explicit exclusions

This plan does not authorize:

- Production database DDL, DML, migration replay, or policy changes.
- Live Edge Function deployments or secret/configuration changes.
- Vercel project/environment/domain changes.
- Billing or paid resource activation.
- PR merge, production deployment, or public release.

## 12. Exit criteria

The frontend integration is not complete until the SDK and lockfile are committed, CI passes on the exact final SHA, auth lifecycle and RLS negative tests pass, browser/device QA is documented, and the live deployed backend contracts are reconciled. Production release remains a separate human approval gate.
