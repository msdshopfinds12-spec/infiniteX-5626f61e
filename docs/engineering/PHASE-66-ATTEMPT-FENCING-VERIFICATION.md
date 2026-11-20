# Phase 66 — Attempt Fencing and Worker Concurrency Contract

**Branch:** `engineering/infinitex-canonical-integration-candidate`  
**Verified candidate commit:** `f727d4fc9aff9b16b0c4a811db276128143538ae`  
**Status:** Candidate source and CI verified; live PostgreSQL concurrency test pending

## Objective

Prevent an older workflow worker from overwriting a newer worker's step-run result after a lease is reclaimed and the workflow-run attempt generation advances.

## Candidate implementation

1. `isAttemptGenerationNewer(storedAttempt, candidateAttempt)` accepts only positive safe-integer generations where candidate is strictly greater than stored.
2. Both authenticated and cron workers read the existing step-run generation and reject equal, stale, or malformed generations before attempting an update.
3. Both workers retain a conditional database update with `attempt < candidateGeneration`. This database predicate is the authoritative compare-and-set; the early helper is a fail-fast guard, not a replacement for atomic SQL.
4. The absent-row path retains the unique-conflict recovery flow using the same database compare-and-set.
5. Existing terminal updates remain fenced by exact `attempt = claimedGeneration` filters.

## Test coverage

- Node tests validate strict monotonic generation checks, malformed values, and stale completion ordering.
- Deno tests validate the same generation contract and model a newer generation committing before a delayed stale worker.
- The Node suite covers retry behavior and the shared action executor.
- The Deno suite covers generation, retry, and safe-action contracts.
- CI type-checks both authenticated and cron Edge Function entry points.

**Important scope:** deterministic model tests verify the intended contract but do not prove PostgreSQL transaction isolation, RPC lease behavior, or real concurrent database writes. A local/isolated Supabase concurrency test is still required.

## CI evidence

The exact candidate push commit passed:
- [Expanded candidate quality gates — SUCCESS](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44793350089)

Verified steps: npm ci, npm audit, TypeScript lint, Node unit/regression tests, Edge Function/worker security tests, Deno worker regression suite, Deno type-check of both worker entry points, and production build.

## Release blockers

- Deployed Edge Function code remains different from candidate source.
- Reproduce lease expiry/reclaim and concurrent stale completion against an isolated PostgreSQL/Supabase runtime.
- Verify RPC transaction/lease behavior under concurrent workers.
- Add real integration tests for the authenticated and cron adapters.
- Keep PR #102 Draft until human review and release approval.

## Safety boundary

No production SQL writes, migrations, function deployments, cron changes, secret reads/changes, billing changes, production data writes, merge, or release were performed.
