# Phase 6G.14 — PostgreSQL 17 Disposable Harness Status

Date: 2026-11-20
Branch: `feat/infiniteX-zero-budget-implementation`
Status: DISPOSABLE DATABASE CONTRACT SMOKE TESTS PASS; PRODUCTION DRIVER NOT IMPLEMENTED

## Scope delivered

Added a PostgreSQL 17.6 GitHub Actions service workflow and a guarded, test-only schema under `tests/postgres/`. The harness is intentionally separate from `supabase/migrations/` and does not connect to any shared or production backend.

Files:
- `tests/postgres/bootstrap.sql` — disposable task, approval-grant, idempotency and append-only event tables with constraints.
- `tests/postgres/contract.sql` — PostgreSQL major-version, running/lease consistency, idempotency uniqueness, token-digest shape and append-only event assertions.
- `tests/postgres/run.sh` — fail-closed environment guard, rollback assertion, and two-independent-session compare-and-set claim race.
- `tests/postgres/README.md` — local setup, limitations and acceptance gates.
- `.github/workflows/postgres-integration.yml` — isolated PostgreSQL 17.6 service job using synthetic credentials only.

The runner requires `INFINITEX_TEST_DATABASE=1`, `PGDATABASE=infinitex_test`, and a loopback/service PGHOST. Bootstrap drops and recreates only the dedicated `infinitex_harness` schema. No production URL or secret is present in the workflow.

## Verified GitHub Actions evidence

- PostgreSQL 17 disposable contract CI: SUCCESS — [run 44573727709](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44573727709)
- PostgreSQL reported version 17.6.
- Schema constraints passed, including complete lease tuple for running tasks.
- Duplicate owner/task/operation/idempotency scope was rejected.
- Append-only event trigger rejected mutation.
- Explicit transaction rollback restored task status/version/event sequence/fencing and removed the attempted event.
- Two independent sessions raced on the same approved task and expected version; exactly one conditional update and one event committed.
- Frontend CI: SUCCESS — 145 tests passed, 0 failed; typecheck, browser/server boundary, production build and npm audit passed (0 vulnerabilities reported). [Run 44573727331](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44573727331)
- Browser/Accessibility CI for the same head commit was still in progress when this document was written; do not mark it passed until the workflow completes.

## Failure and correction retained in history

The first PostgreSQL harness run failed because the rollback fixture reused an event sequence already occupied by its approval event. The fixture was corrected to seed event sequence 1, and the rollback assertion now verifies that the prior sequence remains 1 after rollback. The successful run above is the rerun after this correction. The initial failed run is retained as engineering evidence: [run 44573488511](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44573488511).

## Explicit limitations

This is a database primitive/contract smoke harness, not the InfiniteX production driver and not full lifecycle acceptance. It does NOT prove:
- one-time approval-grant consumption and claim in one production RPC;
- renewal, settlement, cancellation, expiry and stale-worker fencing through database RPCs;
- cancellation/settlement races or expired-lease recovery;
- tenant isolation, RLS, browser/anonymous role denial or service-role boundaries;
- authenticated worker identity or HMAC token verification;
- production durability, backend ownership, live Supabase/PostgreSQL connectivity, or deployment.

The SQL schema is test-only and is not a migration. No database credentials, production secrets, billing, deployment, or live data were touched. Executor remains disabled.

## Next phase — 6G.15

1. Reconcile the SQL harness with the current provider-neutral adapter input/output contract.
2. Add transaction functions for grant issuance, atomic grant consumption + claim, renewal, settlement, and cancellation.
3. Add independent-connection tests for expired leases, stale fences, idempotent replay/conflict, cancellation/settlement race and rollback across all related tables.
4. Add dedicated database roles and test privileges/RLS or equivalent tenant authorization.
5. Only then implement a server-side driver and map it to the adapter behind an explicit backend decision.

## Approval boundary

No live schema, migration, production backend selection, credentials, executor, merge, or deployment was authorized or performed by this phase.
