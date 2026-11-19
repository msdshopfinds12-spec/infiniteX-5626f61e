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
- Phase 6G.15 test-only functions exercise approval, one-time grant consumption plus claim, idempotent replay/conflict, database-clock lease renewal, fenced settlement and owner-scoped cancellation.

## What it does not prove

The Phase 6G.15 functions remain disposable test contracts, not production RPCs. They accept owner and worker identifiers as explicit arguments and do not authenticate them. They do not prove RLS, browser-role isolation, tenant authorization, worker credential authentication, production adapter wiring, or a production driver. Stale-worker checks are covered for mismatched worker identity, but lease-recovery and cancellation/settlement races still require independent-session tests. Do not describe this harness as production readiness.

## Safety and execution

The runner refuses to execute unless all are true:
- INFINITEX_TEST_DATABASE=1
- PGDATABASE=infinitex_test
- PGHOST is postgres, localhost, or 127.0.0.1

CI starts a fresh PostgreSQL 17.6 service with synthetic fixtures and a disposable test-only password. It has no Supabase URL, production secret, or production database credential.

For a local disposable PostgreSQL 17 instance:

    INFINITEX_TEST_DATABASE=1 PGHOST=127.0.0.1 PGPORT=5432 PGDATABASE=infinitex_test PGUSER=infinitex_test PGPASSWORD='<disposable-local-password>' bash tests/postgres/run.sh

The bootstrap drops and recreates only the infinitex_harness schema. Never point it at a shared, staging, or production database. The lifecycle functions are loaded only by this disposable runner and must never be copied into a production migration.

## Next acceptance gates

1. Add independent-session tests for duplicate-key claim races, expired leases, and cancellation-versus-settlement races.
2. Prove least-privilege roles, RLS/authorization boundaries and append-only event permissions.
3. Bind owner/worker identity to a verified server principal; never trust function arguments as authentication.
4. Map a real server driver to the provider-neutral adapter and run contract tests against it.
5. Keep executor disabled until all gates and a separate security review pass.
