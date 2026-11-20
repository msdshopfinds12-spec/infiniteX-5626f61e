# Phase 77 — Worker/PostgreSQL Integration

**Status:** IMPLEMENTED — isolated PostgreSQL integration gate added; GitHub Actions execution pending.  
**Base:** `phase-76/api-key-frontend-contract`  
**Database target:** Disposable Supabase PostgreSQL 17.6.1.136 container only.

## Objective

Exercise the repository's recovered database migration chain and worker queue state machine against an isolated PostgreSQL engine. The purpose is to test database behavior that source-pattern tests cannot prove: actual row locks, `SKIP LOCKED`, retry recovery, uniqueness, generation-guarded updates, and effective RLS/privilege behavior.

## CI execution

Workflow: `.github/workflows/phase-77-worker-postgres-integration.yml`

1. Run existing source-level worker security, CORS, auth-boundary and runtime-parity tests.
2. Run Phase 77 harness static/safety tests and `bash -n`.
3. Start the pinned Supabase PostgreSQL 17.6.1.136 container with scheduled jobs disabled.
4. Replay the 19 recovered migration entries and separately classified candidate migration through the existing provenance-checked rehearsal script.
5. Run real PostgreSQL lock/claim/lease-recovery/generation-fencing tests.
6. Stress 16 independent PostgreSQL sessions against 80 synthetic queued runs and race duplicate step-run inserts.
7. Run the new run/step state-machine integration harness.
8. Run the existing tenant-isolation/API-key security regression suite in a separate disposable database.
9. Collect logs and remove the temporary database container even on failure.

## New test

`scripts/test-phase-77-worker-state-machine.sh`:

- Refuses to run unless `PGDATABASE=infinitex_rehearsal`.
- Uses synthetic fixed UUIDs and test-only records.
- Verifies the real internal claim function returns generation 1.
- Advances the fixture to generation 2 to represent a later lease owner.
- Asserts stale generation 1 run and step terminal updates affect zero rows.
- Asserts generation 2 can commit terminal state.
- Verifies exactly one step-run row exists for the run/step identity.
- Deletes the synthetic owner and cascaded test data in an EXIT cleanup trap.

Static contract tests live in `tests/database/phase-77-worker-postgres-integration.test.mjs`.

## What this proves if CI passes

- The checked-in migration chain is replayable in the pinned disposable Supabase PostgreSQL environment under the existing provenance rules.
- Database queue claim concurrency and stale lease recovery behave as asserted by the existing SQL shell harnesses.
- Parallel claimers do not duplicate the 80 seeded run claims in the stress test.
- A stale attempt cannot overwrite a later attempt's terminal run/step state in the SQL compare-and-set fixture.
- Existing tenant/RLS and API-key permission assertions remain green.

## Important limitations

This is not a live Edge Function deployment test. The new SQL harness simulates the database-side generation transition; the worker source tests separately assert that the TypeScript handlers include the expected attempt filters. It does not launch the Deno Edge Runtime or make authenticated HTTP requests to deployed functions.

The workflow's reconstructed workflow-table baseline remains explicitly noncanonical, and the migration replay report retains its existing provenance limitations. Passing this workflow does not establish exact historical schema equivalence or live production parity.

## Safety

- No hosted Supabase URL, production credential, secret, or user data is used.
- No production SQL, migration, GRANT/REVOKE, Edge Function deployment, cron schedule change, Vercel action, merge, or billing change is performed.
- Scheduled jobs are disabled in the disposable PostgreSQL container.
- CI permissions are read-only for repository contents.

## Follow-on

Phase 78 should connect the browser/API services to the actual React workflow views and exercise loading, empty, retry, offline, and authorization states. A later runtime gate should run the Edge Functions in a local Deno/Supabase environment and execute authenticated HTTP-to-database flows before any production rollout is considered.
