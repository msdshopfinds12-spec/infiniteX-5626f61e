# Phase 71 — Worker HTTP integration boundary

## Scope

This phase extracts the authentication/privilege boundary from the two Deno worker entrypoints into injectable functions. The authenticated worker continues to use a verified user bearer identity and user-scoped claim RPC. The cron worker continues to verify its dedicated secret through the privileged verification RPC before exposing the admin client.

## Implemented on this branch

- `worker-auth-boundary.mjs`: dependency-injected bearer and cron authentication boundaries.
- `worker-auth-boundary.test.mjs`: executable Node tests using fake environment providers and mock Supabase clients.
- Authenticated worker delegates bearer parsing, environment validation, and `auth.getUser` to the boundary.
- Both worker entrypoints now export injectable `createAuthenticatedWorkerHandler` / `createCronWorkerHandler` factories; Deno serving is restricted to `import.meta.main` startup.
- Cron worker delegates secret validation and `simula_verify_worker_secret` to the boundary.
- Bearer parsing trims HTTP optional whitespace and requires exactly one non-whitespace token; malformed schemes and multi-token values are rejected.
- A regression was found during code review: the initial parser regex was double-escaped. It has been corrected and malformed-header cases were added to the test suite.
- Existing downstream claim RPCs, owner checks, workflow execution, attempt fencing, and terminal writes remain in their respective adapters.
- `index.deno.ts` now contains a stateful Supabase mock implementing table reads, filters, ordered steps, inserts, conditional updates, RPC claims, and log persistence.
- Stateful integration scenarios cover successful two-step execution for both authenticated and cron handlers, stale-generation fencing, and action-failure persistence.

## Security invariants

1. Missing bearer token is rejected before any client is created.
2. Authenticated identity must be resolved by `auth.getUser(token)` before the user-scoped claim is reachable.
3. Missing/short cron secret is rejected before creating a privileged client.
4. Cron secret verification must return exactly boolean `true` and no RPC error before the admin client is returned to the handler.
5. Incomplete environment configuration fails closed.
6. Stale workflow-step generations cannot execute actions or overwrite newer persisted state.
7. A failed action must persist failed step and workflow states; it must not be reported as success.
8. User and cron privilege boundaries remain separate.

## Validation

Run:

```sh
deno test --no-check supabase/functions/simula-workflow-worker/index.deno.ts
npm run test:worker-http-boundary
npm run test:workers
npm run test:edge-function-security
npm run lint
npm run build
```

GitHub Actions run #44802441505 passed on commit `0d6362b63b3e43cfd57167ad3f9f847f2360b3a1`. This includes Deno HTTP-handler integration, stateful multi-step execution for both worker paths, stale-generation fencing, action-failure persistence, Node auth-boundary and regression suites, TypeScript lint, and Vite production build. The stateful mock is not a real Supabase/PostgreSQL server; real worker-to-database integration, additional failure-injection cases, and live schema comparison remain outstanding.

## Safety constraints

- No production database writes or migrations.
- No secrets are read, printed, or changed by these tests.
- No Edge Function deployment.
- No merge or promotion of PR #102.
- Mock clients and synthetic identities only.
