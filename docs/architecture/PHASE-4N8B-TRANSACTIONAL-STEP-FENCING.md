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
