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
