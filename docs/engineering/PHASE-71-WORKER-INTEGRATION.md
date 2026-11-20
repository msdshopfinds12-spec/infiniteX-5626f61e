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

## Security invariants

1. Missing bearer token is rejected before any client is created.
2. Authenticated identity must be resolved by `auth.getUser(token)` before the user-scoped claim is reachable.
3. Missing/short cron secret is rejected before creating a privileged client.
4. Cron secret verification must return exactly boolean `true` and no RPC error before the admin client is returned to the handler.
5. Incomplete environment configuration fails closed.
6. User and cron privilege boundaries remain separate.

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

The new tests cover the extracted authentication boundary only. They do **not** yet constitute full HTTP-handler integration or complete workflow execution tests. Those remain Phase 71B–71F acceptance work.

## Safety constraints

- No production database writes or migrations.
- No secrets are read, printed, or changed by these tests.
- No Edge Function deployment.
- No merge or promotion of PR #102.
- Mock clients and synthetic identities only.
