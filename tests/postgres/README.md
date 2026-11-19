# InfiniteX PostgreSQL 17 disposable harness

This is a test-only contract smoke harness, not a production database driver.

## What it checks

- PostgreSQL 17 is actually running.
- Domain task states and complete-running-lease consistency.
- Owner/task/operation/idempotency-key uniqueness.
- Approval token digest storage shape; no raw token fixture.
- Append-only events and independent task/event/fencing counters.
- Transaction rollback leaves no partial task mutation or event.
- Two independent PostgreSQL sessions racing on one expected version produce exactly one conditional-update winner and one event.

## What it does not prove

This first harness milestone does not implement or verify production RPCs, atomic approval-grant consumption plus claim, lease renewal/settlement/cancellation, stale-worker rejection after recovery, RLS, browser-role isolation, tenant authorization, worker credential authentication, or a production driver. Do not describe it as production readiness.

## Safety and execution

The runner refuses to execute unless all are true:
- INFINITEX_TEST_DATABASE=1
- PGDATABASE=infinitex_test
- PGHOST is postgres, localhost, or 127.0.0.1

CI starts a fresh PostgreSQL 17.6 service with synthetic fixtures and a disposable test-only password. It has no Supabase URL, production secret, or production database credential.

For a local disposable PostgreSQL 17 instance:

    INFINITEX_TEST_DATABASE=1 PGHOST=127.0.0.1 PGPORT=5432 PGDATABASE=infinitex_test PGUSER=infinitex_test PGPASSWORD='<disposable-local-password>' bash tests/postgres/run.sh

The bootstrap drops and recreates only the infinitex_harness schema. Never point it at a shared, staging, or production database.

## Next acceptance gates

1. Implement approved transactional RPCs, including one-time grant consumption and idempotent replay.
2. Test claim, renewal, settlement, cancellation and expiry with independent sessions and database time.
3. Add stale fencing/recovery and cancellation-versus-settlement race tests.
4. Prove least-privilege roles, RLS/authorization boundaries and append-only event permissions.
5. Map a real server driver to the provider-neutral adapter and run contract tests against it.
6. Keep executor disabled until all gates and a separate security review pass.
