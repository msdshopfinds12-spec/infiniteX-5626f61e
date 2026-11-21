# Phase 103.2 — Database Lease Fencing

**Status:** Draft rehearsal patch committed for review; not executed or validated against PostgreSQL in this change.
**Scope:** Additive database RPC contract for step start, failure, and completion/outbox creation.
**Target branch:** `phase-103-2-database-lease-fencing`
**Base commit:** `b23791957a8c364c3f476657c140498303e1c544`

## Safety boundary

- This patch is under `supabase/patches/`, not `supabase/migrations/`.
- Do not apply it to hosted Supabase.
- Apply only to a disposable PostgreSQL database after replaying the exact repository migrations and Phase 102.6 + 103.1 rehearsal patches.
- No production data, hosted credentials, deployments, merges, or release settings are changed.
- This patch alone does not complete the lease protocol: both workers still need Phase 103.3–103.5 integration, and the legacy RPC path must be retired or denied once both workers have migrated.

## Transition contract

Every transition uses the tuple `(run_id, owner_id, attempt, lease_token)`. The RPC locks the workflow run first, validates owner/status/generation/token, then evaluates expiry using `clock_timestamp()` **after lock acquisition**. It retains the row lock through the step/outbox mutation and transaction commit.

| RPC | Contract |
|---|---|
| `simula_start_workflow_step_with_lease` | Creates or advances the step generation; same-generation running replay is idempotent; terminal same-generation replay is rejected. |
| `simula_fail_workflow_step_with_lease` | Fails only the matching running step generation under a valid run lease. |
| `simula_complete_step_with_outbox_lease` | Validates and locks the run lease, then invokes the existing atomic step-completion + outbox RPC in the same transaction. |

## Lock order

1. `workflow_runs`
2. `workflow_step_runs`
3. `private.simula_workflow_outbox`

All future lifecycle RPCs must follow this order. Avoid any reverse path that locks a step/outbox row and then waits for the run row.

## Required disposable-PostgreSQL tests

1. Valid lease can start a step.
2. Same lease + same attempt + running step returns the same step ID without overwriting input.
3. Older attempt cannot overwrite a newer step generation.
4. Same attempt in a terminal step state cannot restart.
5. Wrong owner, token, attempt, status, or run ID is rejected.
6. Expired lease is rejected after lock acquisition (include a lock-wait test where expiry occurs while waiting).
7. Failure updates only the matching running step.
8. Completion and outbox intent commit atomically.
9. Duplicate completion with the same idempotency identity is deterministic.
10. Two concurrent starts for the same run/step serialize safely.
11. Lease rotation cannot interleave between wrapper validation and outbox mutation.
12. Authenticated/anon roles cannot execute service-role RPCs.
13. SQLSTATE and error identifiers are stable and mapped safely by TypeScript.
14. Migration replay plus both existing worker regression suites remain green.

## Known compatibility limitation

The legacy `simula_complete_step_with_outbox` remains service-role callable so the currently deployed source contract is not broken mid-phase. Until both workers exclusively call the lease-fenced RPC and the legacy permission/path is retired, a privileged caller could still bypass lease fencing. Treat full fencing as **NOT VERIFIED** until that retirement is tested.

## Next sequence

- Phase 103.2 test harness: implement the above cases in the existing disposable CI journey.
- Phase 103.3: shared TypeScript lease adapter with heartbeat supervision and cancellation.
- Phase 103.4/103.5: switch authenticated and cron workers to lease-aware RPCs; remove direct lifecycle table writes.
- Final hardening: revoke legacy service-role execution only after call-site search proves no active caller remains.
