# Phase 1 — Task Repository Repair Evidence

## Scope

Branch: `feature/infiniteX-platform-integrations`

Approved changes:
- Repair task idempotency behavior.
- Validate that a referenced agent belongs to the authenticated tenant.
- Return HTTP 409 for an idempotency key reused with a different request.
- Add repository behavior tests.
- Do not add migrations, deployment changes, paid services, secrets, production changes, or merge to the default branch.

## Source changes recorded

| File | Change |
|---|---|
| `apps/api/src/repositories/task-repository.ts` | Validate agent tenant ownership; compare existing request using PostgreSQL JSONB equality and null-safe agent comparison; raise typed errors for mismatches and unresolved conflict lookups. |
| `apps/api/src/routes/tasks.ts` | Trim and validate idempotency keys; map mismatched reuse to HTTP 409 and tenant-scoped missing agents to HTTP 404. |
| `apps/api/tests/task-repository.test.ts` | Add mocked repository tests for creation, identical retries, changed payload, changed agent, foreign-tenant agent, and missing conflict lookup. |

## Test cases added

1. New idempotency key creates a task.
2. Identical retry returns the original task with `created: false`.
3. Reusing a key with a different JSON payload raises `TaskIdempotencyConflictError`.
4. Reusing a key with a different agent raises `TaskIdempotencyConflictError`.
5. An agent not found under the authenticated tenant raises `TaskAgentNotFoundError`.
6. A conflict lookup that unexpectedly returns no row raises `TaskIdempotencyLookupError`.

## Execution evidence

**Status: NOT RUN — runtime execution is unavailable in this GitHub-only editing session.**

No claim is made that the tests, TypeScript typecheck, or production build pass. The tests are committed as source, but require execution in a Node.js 22+ environment with the API package dependencies installed.

Run from `apps/api`:

```bash
npm ci
npm test -- tests/task-repository.test.ts
npm test
npm run typecheck
npm run build
```

Record the actual command output, exit code, Node version, and package-manager lockfile used before marking the checks as passed. Do not substitute a successful GitHub file write for test evidence.

## Remaining verification

- Verify the deployed PostgreSQL schema and unique constraint for `(tenant_id, idempotency_key)`.
- Verify actual RLS policies and database role privileges.
- Run repository tests against a real PostgreSQL test database in CI or a controlled test environment.
- Review whether agent deletion/disablement should affect replay of an already accepted idempotent request.
- Confirm route-level HTTP 409 and 404 behavior with Hono route tests.

No migrations, deployment, secrets, paid integrations, production changes, or merges were performed.
