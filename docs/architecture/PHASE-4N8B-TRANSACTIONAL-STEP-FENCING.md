# Phase 4N.8B transactional step fencing

## Scope
The authenticated and cron workers delegate step start/success/failure writes to
`public.simula_transition_workflow_step`. The RPC locks the parent run row, checks
owner/status/attempt and workflow-step membership, then performs the child transition
inside the same transaction.

## Local verification
1. Use a disposable local Supabase database, never production.
2. Apply the migration with the Supabase CLI.
3. Run `supabase/tests/phase-4n8b-transactional-step-fencing.test.sql` for RPC
   existence and least-privilege grants.
4. Seed a disposable fixture: one workflow, one running workflow_run at the chosen
   attempt, and one step belonging to that workflow. The fixture must have no step-run
   row for that generation (or an older generation).
5. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `PHASE_4N8B_TEST_RUN_ID`, `PHASE_4N8B_TEST_STEP_ID`,
   `PHASE_4N8B_TEST_OWNER_ID`, and `PHASE_4N8B_TEST_ATTEMPT`, then run
   `deno test --allow-env --allow-net supabase/functions/_shared/transactional-step-fencing.integration.test.ts`.
6. The integration test races two same-generation starts (exactly one must win),
   advances the parent generation, then asserts the stale worker cannot finish.

## Verification status
- Implementation authored: pending CI and local database verification.
- Live migration: not performed.
- Merge/deployment: not performed.
- The integration test mutates its fixture; use only a disposable local database.


## CI fixture contract (fail-closed)

The Deno integration test is mandatory and does not use `ignore`. Missing fixture
configuration causes a test failure, not a skipped/green result. CI must provision
a disposable database fixture and pass all six `PHASE_4N8B_TEST_*` / Supabase
environment values before this job can pass.

Fixture requirements:
- The run exists, belongs to the supplied owner, is `running`, and has the exact
  supplied attempt generation.
- The step exists and its `workflow_id` equals the run's `workflow_id`.
- No `workflow_step_runs` row exists for the selected run/step pair before the test.
- The fixture is isolated and disposable. The test creates a step-run row, temporarily
  increments the parent attempt, then deletes only its own step-run row and restores
  the original attempt in `finally`.
- Cleanup attempts both restoration operations even if one fails; any cleanup error
  fails the test.

**Current CI limitation:** the workflow does not yet provision this fixture. Until a
dedicated disposable PostgreSQL/Supabase-compatible test environment is wired into
CI, the integration job is expected to fail closed. Do not add credentials from the
live project to make it pass. A plain PostgreSQL harness must be labelled as SQL/RPC
contract testing, not full Supabase Auth/PostgREST/Edge Runtime integration.


## CI environment feasibility review

A follow-up repository inspection found that this branch does not contain
`supabase/config.toml`, `supabase/seed.sql`, or the baseline migration
`20261103134302_ashaa_backend_credit_ledger.sql`. The current workflow also
does not provision a local Supabase stack or a disposable fixture. The integration
test requires a Supabase-compatible HTTP endpoint and a service-role credential;
therefore, a plain PostgreSQL service container cannot execute that Deno
`supabase-js` test as written.

### Safe decision

- Do not wire the live project's URL or service-role key into GitHub Actions.
- Do not fabricate a partial schema and label it a full integration environment.
- Do not run the fixture test against the production project.
- Keep the test fail-closed; the current workflow will fail at the required fixture
  assertion until an isolated fixture is provisioned. This is intentional and visible.
- Before implementing CI provisioning, recover and review the complete canonical
  migration chain and Supabase local configuration from the repository's authoritative
  branch. Then choose one of two explicit test tiers:
  1. **Local Supabase integration tier:** start a disposable local Supabase stack,
     apply the complete migration chain, seed unique fixture rows, export only
     ephemeral local service credentials, execute Deno tests, and tear down.
  2. **PostgreSQL contract tier:** use a disposable PostgreSQL 17 service with a
     complete reviewed schema/role harness and SQL-native concurrent sessions.
     Label results as database contract tests, not Supabase HTTP/Auth integration.

The current PR does not yet meet either tier. CI provisioning remains BLOCKED,
not passed. The next implementation must first establish the authoritative schema
source and migration order, then add a deterministic fixture lifecycle and cleanup.


## CI execution policy (isolated fixture gate)

The workflow now separates source/build verification from database integration
execution. The integration test runs only when the repository variable
`PHASE_4N8B_FIXTURE_READY` is explicitly set to `true`. At that point, all
`PHASE_4N8B_*` fixture values and the Supabase URL/service-role key must be
provided through dedicated GitHub Actions secrets. Missing values cause the
Deno test to fail closed.

When the readiness variable is absent or false, CI records **NOT RUN** in the
GitHub Actions step summary. A successful source/build job in that mode is not
evidence of database concurrency correctness. The configured endpoint must be a
dedicated disposable test project, never the production Supabase project.
Fixture provisioning, teardown automation, and proof that the endpoint is isolated
remain release gates.


## Destructive-test endpoint guard

The Deno integration test now rejects the known production Supabase hostname
`vepacoemkhudamfaccah.supabase.co` before creating a client or reading fixture
rows. It also requires HTTPS for remote fixture endpoints (localhost/127.0.0.1
are allowed for a local disposable stack). This is a defense-in-depth guard,
not a replacement for dedicated disposable credentials, fixture isolation,
and teardown controls.


## Migration schema-contract test

The SQL test now checks the RPC privilege boundary, every relation/column
referenced by the transition function, and the exact unique key
`workflow_step_runs(run_id, step_id)`. This is a catalog-level compatibility
check only. It does not prove transition semantics, transaction rollback,
concurrent-session behavior, lock-order safety, or Edge Function integration;
those remain separate test gates.


## Local-only integration endpoint policy

The mutating Deno fixture test accepts only loopback HTTP Supabase endpoints:
`http://localhost` and `http://127.0.0.1`. Remote Supabase hosts,
including HTTPS project URLs, are rejected. URL credentials are also rejected.
The GitHub Actions invocation restricts Deno network access to those two
loopback hostnames and limits environment access to the six fixture variables.

This is intentionally stricter than merely rejecting the known production
hostname: an arbitrary remote HTTPS URL could still point to an unintended
project. The test must run against a disposable local Supabase stack only.

**Infrastructure remains BLOCKED:** the current repository branch does not
contain a verified complete Supabase migration chain or local Supabase
configuration, and the workflow does not start a local Supabase stack. Keep
`PHASE_4N8B_FIXTURE_READY` unset/false until reproducible local stack startup,
migration application, synthetic fixture creation, and teardown are implemented
and reviewed. Do not set it to true with a remote project URL.
