# Phase 2 — Database Isolation and Durable Execution

**Target:** `fix/infiniteX-foundation-hardening`  
**Reviewed baseline:** `9af83d0a16b224c55d2f4bdbbaf8c9adb4e21533`  
**Status:** DESIGN ONLY — no migration, deployment, provider activation, billing change, PR, or merge performed.

## Current findings

The branch has SQLAlchemy task/memory models, Alembic migration files, a PostgreSQL session factory, task repository, and process-local `JobQueue` / `TaskEngine`.

The reviewed code is not production-ready for multi-tenant durable execution:

1. Task repository sets transaction-local `app.tenant_id`, but consistent context setup across every tenant repository was not established.
2. A PostgreSQL custom GUC is not an independent identity proof. A runtime DB role can generally set custom GUCs; RLS here is defense-in-depth against accidental unscoped queries, not a defense against a compromised application role or arbitrary SQL execution.
3. RLS is bypassed by superusers and roles with `BYPASSRLS`. Runtime role must be separate from migration/table-owner role, non-superuser, and without `BYPASSRLS`.
4. The queue is in-memory; jobs do not survive process restarts and multiple workers cannot coordinate durable claims.
5. There is no persisted lease/heartbeat/recovery flow. A crash can leave tasks RUNNING.
6. Retry behavior needs idempotent side-effect contracts; retries can duplicate external provider actions.
7. Free-only provider authorization and atomic usage quotas are not evidenced.
8. SQLite/mocked tests cannot prove PostgreSQL RLS, row locking, transaction-local context isolation, or concurrent claims.

## Target architecture

```text
Verified JWT -> principal + tenant membership authorization
             -> request-scoped transaction
             -> transaction-local tenant context
             -> tenant-scoped repositories + PostgreSQL RLS
             -> task + idempotency record + outbox (one transaction)
             -> PostgreSQL durable queue
             -> atomic worker claim (FOR UPDATE SKIP LOCKED)
             -> lease + heartbeat + retry/dead-letter
             -> server-side free-provider allowlist + atomic quota
             -> result + append-only usage ledger
```

Prefer PostgreSQL as the first durable queue to avoid adding Redis or a paid broker before measured need.

## Database/RLS requirements

- Separate `infinite_migrator` schema-owner credentials from `infinite_app` runtime credentials.
- Runtime role: no superuser, no `BYPASSRLS`, no table ownership, no DDL, no membership in migration role.
- Resolve tenant membership from verified identity on the server; never trust client tenant headers.
- Every tenant-scoped transaction must set context using bound parameters and transaction-local settings, then commit/rollback so pooled connections cannot leak context.
- Every repository must also include explicit tenant predicates.
- Apply fail-closed RLS to tasks, memories, knowledge edges, idempotency, queue, outbox, and usage tables.
- Missing context must deny reads/writes. Align UUID/text column types before choosing a policy cast.
- Treat custom GUC context as defense-in-depth only; do not claim it protects against arbitrary SQL execution by the app role.

Illustrative SQL only (not to execute):

```sql
SELECT set_config('app.tenant_id', :authorized_tenant_uuid, true);
SELECT set_config('app.actor_sub', :verified_subject, true);
```

## Migration review gates

Before approving any migration:
- Inspect the full Alembic revision graph; verify whether `0001_task_records` with `down_revision = None` conflicts with existing history.
- Reconcile every ORM field with migration type, nullability, defaults, constraints, indexes, and foreign keys.
- Add valid-state and nonnegative-attempt constraints.
- Verify every tenant-owned table has tenant key, RLS, and tenant-aware indexes.
- Test upgrade and downgrade only on disposable PostgreSQL.
- Produce schema diff and rollback-risk report. Never run downgrade on production data.

## Durable queue contract

Logical tables:
- `job_queue`: status, available_at, priority, attempts, lease_owner, lease_expires_at, heartbeat_at, lease_version.
- `job_attempts`: append-only attempt history.
- `outbox_events`: atomic API-to-worker handoff.
- `idempotency_records`: unique tenant + key + canonical request hash.
- `dead_letter_jobs`: terminal failure and controlled replay history.
- `usage_ledger` and `tenant_usage_periods`: auditable usage and atomic quota counters.

Atomic claim design reference:

```sql
WITH candidate AS (
  SELECT job_id FROM job_queue
  WHERE status = 'QUEUED' AND available_at <= now()
  ORDER BY priority DESC, available_at, created_at
  FOR UPDATE SKIP LOCKED LIMIT 1
)
UPDATE job_queue AS q
SET status = 'RUNNING',
    lease_owner = :worker_id,
    lease_expires_at = now() + (:lease_seconds * interval '1 second'),
    heartbeat_at = now(),
    attempts = attempts + 1
FROM candidate
WHERE q.job_id = candidate.job_id
RETURNING q.*;
```

Final implementation must include authorized tenant context and stale-lease fencing. Never hold a DB transaction open during a provider call. Heartbeats/completion must match job ID, worker ID, and lease version. Recover expired leases. Use capped exponential backoff with jitter; route non-retryable failures directly to terminal state.

Do not promise exactly-once execution across DB and external providers. Target at-least-once delivery plus idempotent effects. Same idempotency key + same request hash returns the original task; same key + different hash returns HTTP 409. External side effects require provider idempotency support or explicit duplicate-risk handling.

## Free-only provider controls

- Server-side versioned allowlist of explicitly permitted free-tier provider/model adapters.
- Default deny paid, unknown, unverified, or unavailable models.
- Never let client-supplied provider/model names authorize a route.
- Keep credentials server-side; redact logs.
- Enforce atomic per-tenant request/token ceilings before dispatch.
- Record provider, model, policy version, usage, and outcome.
- If current free-tier status is uncertain, block; never silently fall back to a paid provider.

## Required PostgreSQL verification

| Scenario | Required outcome |
|---|---|
| Missing tenant context | No rows visible; writes denied |
| Tenant A accesses Tenant B | No data disclosure |
| Tenant A inserts Tenant B row | RLS rejects |
| Pooled transaction context changes | No context leakage |
| Runtime role owns table / BYPASSRLS | Deployment preflight rejects |
| Two workers claim same job | One claim succeeds |
| Worker crashes | Expired lease recovered |
| Stale worker completes | Fenced update rejected |
| Same idempotency key, same body | Original task returned |
| Same key, different body | HTTP 409 |
| Retry limit exhausted | Dead-letter state |
| Duplicate outbox delivery | One logical job |
| Concurrent quota requests | Limit never exceeded |
| Paid/unknown model requested | No provider call; fail closed |

Run against disposable real PostgreSQL: migration upgrade/downgrade, RLS isolation, role privilege checks, pooled-session tests, repository/API tests, concurrent worker claims, crash recovery, idempotency races, quota races, lint/type checks, and full CI. SQLite or mocks are supplementary only.

## Implementation order

1. Inventory every model, migration revision, repository, API contract, test fixture, and DB role assumption.
2. Approve an ADR for tenant identity, role separation, queue semantics, and free-provider policy.
3. Prepare migration files/schema diff only; do not execute.
4. Implement one transaction-scoped tenant context abstraction across all repositories.
5. Add real PostgreSQL RLS and least-privilege role tests.
6. Implement durable queue, leases, heartbeat, recovery, retries, dead-letter, and outbox.
7. Implement atomic usage quotas and fail-closed provider allowlist.
8. Run full PostgreSQL, concurrency, security, and CI checks.
9. Obtain separate human approval before any live migration, provider activation, deployment, merge, or release.

## Exit criteria

Phase 2 is complete only when every tenant table is isolated, runtime credentials cannot bypass RLS, context is safely transaction-scoped, jobs survive restarts, multi-worker claims and lease fencing pass, retries are idempotent, quotas are atomic, paid/unknown providers are blocked, and real PostgreSQL security/concurrency tests pass.

**Current gate: BLOCKED for runtime implementation pending complete migration-graph, repository, runtime-role, and API-contract inspection.**
