# Phase 4N.8B transactional step fencing

## Scope
The authenticated and cron workers now delegate step start/success/failure writes to
`public.simula_transition_workflow_step`. The RPC locks the parent run row, checks
owner/status/attempt and workflow-step membership, then performs the child transition
inside the same transaction.

## Local verification
1. Use a disposable local Supabase database, never production.
2. Apply the migration with the Supabase CLI.
3. Run `supabase/tests/phase-4n8b-transactional-step-fencing.test.sql` using the
   local database test runner.
4. Run the existing edge security test scripts and Deno type checks.
5. Add a two-client integration fixture before marking the race fix fully verified:
   one client starts the same run/step/attempt concurrently; exactly one start must
   succeed. Increment the parent run generation, then assert the old generation's
   terminal transition is rejected.

## Verification status
- Implementation authored: pending CI and local database verification.
- Live migration: not performed.
- Merge/deployment: not performed.
