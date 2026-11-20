# Phase 4N.8B live-schema and worker reconciliation

Date: 2026-11-20

## Executive decision

The candidate worker code on this branch already routes workflow step transitions through the transactional RPC. Do not rewrite those workers a second time. The live Supabase project has not deployed this RPC or these candidate worker sources. The remaining work is schema/privilege compatibility, complete mutation-path inventory, PostgreSQL 17 concurrency verification, and isolated local Supabase integration.

## Candidate worker source verification

Inspected exact files on `audit/phase-4n8b-live-schema-preflight`:

- `supabase/functions/simula-workflow-worker/index.ts`
- `supabase/functions/simula-workflow-cron-worker/index.ts`

Both files:
- call `admin.rpc("simula_transition_workflow_step", args)` through a local `transitionStep` helper;
- route start, succeed and fail transitions through that RPC;
- contain no direct `.insert()`, `.update()`, or `.upsert()` calls against `workflow_step_runs`;
- retain attempt-conditional terminal updates on `workflow_runs`.

The authenticated worker derives the owner from verified `auth.getUser(token)`. The cron worker validates the dedicated worker secret before using service-role queue claiming.

This is candidate-source evidence only. It does not prove deployment or production runtime behavior.

## Live production mismatch

Previously recorded read-only inspection of project `Ashaa-INX` (`vepacoemkhudamfaccah`) established:
- workflow tables and unique run/step identity exist;
- 19 migrations are recorded in the live migration ledger;
- the live catalog did not contain `public.simula_transition_workflow_step`;
- deployed worker source hashes differ from the candidate sources.

Therefore the live worker/database pair is not yet proven to use transactional step fencing. No migration or function deployment has been performed.

## Test coverage and gaps

Existing candidate assets:
- `supabase/migrations/20261120000000_phase_4n8b_transactional_step_fencing.sql`
- `supabase/tests/phase-4n8b-transactional-step-fencing.test.sql`
- `supabase/functions/_shared/transactional-step-fencing.integration.test.ts`
- `.github/workflows/phase-4n8b-transactional-step-fencing.yml`

Existing test semantics:
- SQL catalog test checks RPC existence, grants, required relation/columns and unique constraint.
- Deno integration test races two same-generation starts, then changes the parent attempt and asserts stale completion is rejected.
- Deno test rejects non-loopback URLs and requires a disposable local fixture.
- CI runs Node security tests, Deno worker security tests, Deno type checks and application build.
- Deno mutating database integration runs only when a dedicated local fixture readiness variable is enabled. Without it, the workflow reports NOT RUN.

Outstanding:
1. Prove parent-row lock serialization with independent PostgreSQL sessions where Session A holds the parent row lock while Session B attempts the transition.
2. Run against PostgreSQL 17, matching the live server major version.
3. Verify the actual unique constraint/index supporting `ON CONFLICT (run_id, step_id)`.
4. Verify function owner, SECURITY DEFINER, empty search_path, EXECUTE ACLs and RLS bypass expectations on the exact target schema.
5. Inventory every path that changes run attempt/status: claim, recovery, retry, cancellation, timeout, manual repair and all worker/admin writers. Ensure they serialize against the same parent row.
6. Provision a complete disposable local Supabase stack from a recovered authoritative migration chain; do not point tests at production.

## Important design constraints

- Keep `p_owner_id` server-derived. Never accept it as trusted browser input.
- Only service_role may execute the transition RPC.
- Do not use the production project URL or service-role key in CI.
- Do not apply the candidate migration until exact schema, ownership, grants, migration ordering and rollback/forward-recovery strategy are reviewed.
- Keep the production worker deployment and migration as separate approval gates.
- Do not report a skipped integration test as passed.

## Evidence ledger

| Item | Status |
|---|---|
| Candidate authenticated worker RPC integration | VERIFIED by exact branch source |
| Candidate cron worker RPC integration | VERIFIED by exact branch source |
| No direct candidate REST step-run mutations | VERIFIED by static source scan |
| Live deployed workers use RPC | NOT VERIFIED; deployed sources differ |
| Live production RPC exists | NOT VERIFIED; catalog inspection returned absent |
| PostgreSQL 17 compatibility | NOT TESTED |
| Full isolated Supabase integration | NOT RUN |
| Production migration/deployment | NOT AUTHORIZED |

## Cleanup note

A redundant shared adapter was briefly created after the candidate worker review began. Source inspection then found both workers already had local RPC adapters; the unused file was removed. No runtime behavior was changed by that experiment.
