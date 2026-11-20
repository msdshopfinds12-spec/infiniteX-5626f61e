# Phase 4N.22 — InfiniteX Frontend/Backend Integration Blueprint

**Evidence baseline:** PR #50 head `82c347d1b6a303de68e788adc5739852a0fdba18`  
**Status:** Architecture proposal only; no runtime integration or dependency change performed.

## 1. Verified current implementation

The inspected `src/App.tsx` explicitly renders DEMO MODE. Agent cards, pipeline stages, and log entries are local static arrays. Metric values are illustrative; pipeline creation and run actions are disabled. The security view correctly says security posture is not verified.

The repository has browser-safe Supabase configuration parsing in `src/lib/supabase/config.ts` and `public-config.ts`, plus generated-looking database types in `src/lib/supabase/database.types.ts`. However, the inspected `package.json` does not declare `@supabase/supabase-js`. There is no verified Supabase client, auth provider, protected-route boundary, or feature data-service layer in the inspected source tree.

**Conclusion:** this is a polished frontend demo and configuration foundation, not an integrated Supabase application.

## 2. Target architecture

Keep the Vite/React frontend as a thin presentation layer. Use feature modules and explicit service boundaries; do not put raw database calls inside visual components.

```text
src/
  app/
    App.tsx
    providers/
      AuthProvider.tsx
      QueryProvider.tsx
    routes/
      RouteGuard.tsx
  lib/
    supabase/
      client.ts
      config.ts
      database.types.ts
  features/
    auth/
      auth.api.ts
      auth.types.ts
      useAuth.ts
    projects/
      projects.api.ts
      projects.types.ts
      useProjects.ts
    agents/
      agents.api.ts
      agents.types.ts
      useAgents.ts
    workflows/
      workflows.api.ts
      workflows.types.ts
      useWorkflows.ts
      workflow-runs.api.ts
    logs/
      logs.api.ts
      useLogs.ts
    usage/
      usage.api.ts
      useUsage.ts
    security/
      security.api.ts
      useSecurityStatus.ts
  shared/
    api/
      result.ts
      errors.ts
    components/
    validation/
    telemetry/
```

The tree is a target design, not a claim that these files already exist.

## 3. Dependency and configuration gate

1. Confirm the package manager and committed lockfile in the selected branch.
2. Use Node.js 22 as the current CI baseline.
3. Add the official Supabase JS SDK only through a controlled package-manager install that updates both `package.json` and the lockfile.
4. Record the exact installed version; do not use an unpinned CDN script or hand-edit lockfile contents.
5. Keep only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in browser configuration.
6. Never put service-role keys, secret keys, worker secrets, webhook secrets, or database passwords in Vite variables.
7. Keep demo mode as a deliberate fallback when public configuration is absent; surface an explicit connection state rather than fabricating data.

No SDK install is authorized by this architecture document. A writable Node 22 environment and lockfile regeneration are prerequisites.

## 4. Data ownership and access boundaries

| Feature | Read model | Mutation boundary |
|---|---|---|
| Profile | `profiles` | Owner-scoped update, with validated fields |
| Saved projects | `user_projects` | Owner-scoped CRUD with RLS |
| Tools catalog | `tools` | Public-safe read only unless explicitly authorized |
| Workflows | `workflows`, `workflow_steps` | Owner-scoped API; validate nested ownership |
| Workflow activity | `workflow_runs`, `workflow_step_runs` | Worker/RPC-controlled state transitions |
| Logs | `workflow_logs`, `usage_logs` | Read-only owner-scoped queries |
| Credit ledger | `credit_ledger` | Server-side append-only operation; never client-editable |
| API keys | `platform_api_keys` | Edge Function only; never return `key_hash` |
| Billing | `payments`, `subscriptions`, `billing_webhook_events` | Trusted provider webhook/server operations only |

Never assume that a table name or an authenticated session grants authorization. RLS must enforce row ownership. UPDATE policies require both a safe USING predicate and WITH CHECK predicate. Do not use user-editable `user_metadata` as an authorization source.

## 5. Auth and session model

- Initialize one browser client from the validated public configuration.
- Use Supabase Auth for sign-in/sign-out and session lifecycle.
- For sensitive authorization decisions, validate the current user with the trusted Auth API rather than trusting local UI state.
- Make auth loading, unauthenticated, authenticated, and error states explicit.
- Protect private routes and clear user-scoped cached data on sign-out/account switch.
- Do not infer admin rights from profile display fields or user-editable metadata.
- RLS remains the final data boundary; route guards are UX, not security.

## 6. Workflow and agent execution model

The browser creates and observes workflows; it does not run privileged worker tasks.

1. Validate workflow input at the client for usability and again on the server for trust.
2. Persist owner-scoped workflow definitions through an explicitly authorized path.
3. Enqueue execution through the reviewed Edge Function/RPC boundary.
4. Workers claim jobs using server-side ownership and concurrency controls.
5. Persist run and step transitions atomically; stale attempts must not overwrite newer attempts.
6. Use idempotency keys for side-effecting operations.
7. Represent ambiguous timeouts as `outcome_unknown` until reconciled; do not blindly retry non-idempotent actions.
8. Read logs and run status from persisted records; do not generate synthetic “live” activity.

The candidate Phase 4N.8B transactional RPC is not present in the live catalog. Do not call it until a separately reviewed migration is rehearsed and approved.

## 7. UI state contract

Every data-backed screen must represent:
- `idle`
- `loading`
- `success` (including empty state)
- `error`
- `unauthenticated` where applicable
- `demo` only when the screen is intentionally showing synthetic sample data

Never label sample metrics as uptime, token usage, agent status, pipeline success, or security scan results. Only display operational metrics when they come from timestamped, authorized telemetry.

## 8. Reliability, validation, and testing

### Unit tests
- Public config parsing, including missing/partial/invalid values.
- API response normalization and typed error mapping.
- Input validation and UI state reducers.
- Auth state transitions and cache clearing.

### Integration tests
- Local disposable Supabase only.
- Two distinct users: prove user A cannot read or mutate user B's rows.
- Anonymous, authenticated, and service-role access boundaries.
- Workflow duplicate-start, stale-attempt fencing, retry limits, cancellation, timeout, rollback, and idempotency.
- API-key create/list/revoke: the raw key is shown once; hashes never reach the browser.
- Webhook signature verification and duplicate-event idempotency.

### Browser/device QA
- Mobile viewport first, including narrow Android layouts.
- Keyboard navigation, visible focus, labels, contrast, and reduced-motion behavior.
- Offline/slow network, expired session, refresh, and sign-out.
- No false “connected” status when the API is unavailable.

### CI
- Node 22, `npm ci`, type-check/lint, unit tests, worker tests, production build.
- Disposable backend integration tests are a separate job and must never point at production.
- Store test reports and exact commit SHA.

## 9. Release gates

1. PLAN: approve this architecture and the data-access matrix.
2. BUILD: install SDK with a regenerated lockfile; implement auth and one feature slice at a time.
3. TEST: run unit, local backend, two-user RLS, worker concurrency, and mobile browser tests.
4. AUDIT: inspect bundle output, environment-variable exposure, RLS, RPC grants, CORS, logs, and secrets.
5. RELEASE: human approval for the selected Vercel project, environment variables, migrations, Edge Function rollout, and production deployment.

Supabase CLI v3 changed database commands to target the local stack by default; hosted operations require explicit remote intent and confirmation. Pin the CLI version in automation and inspect `--help` before changing command flags.

## 10. Immediate blockers

- No declared Supabase JS SDK dependency in the inspected `package.json`.
- No verified browser client, auth provider, protected routes, or live data services.
- No confirmed frontend-to-Edge-Function contract and origin configuration in this UI branch.
- Live backend grants and worker source/configuration require reconciliation before enabling mutations.
- Vercel production project/domain remains ambiguous from the prior read-only audit.

**Safe next implementation slice:** create the Supabase client + AuthProvider + session-state tests only after the dependency install and lockfile are generated in a writable Node 22 environment. Do not implement workflow mutations until ownership/RLS and worker contracts are verified.
