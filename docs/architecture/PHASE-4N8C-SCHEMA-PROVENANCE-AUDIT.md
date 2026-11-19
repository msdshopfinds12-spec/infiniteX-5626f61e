# Phase 4N.8C.4 — Schema Provenance and Migration Readiness Audit

**Status:** BLOCKED — schema provenance incomplete  
**Scope:** Read-only GitHub source inspection  
**Target branch:** `feat/phase-4n8c-workflow-reliability-pr35`  
**Production database access:** None  
**Migration authored/applied:** No

## 1. Verified repository evidence

The recursive Git tree for this branch contains exactly one file under `supabase/migrations/`:

- `20261120000000_phase_4n8b_transactional_step_fencing.sql`

The migration adds `public.simula_transition_workflow_step`, which references pre-existing relations:
- `public.workflow_runs`
- `public.workflows`
- `public.workflow_steps`
- `public.workflow_step_runs`

The migration uses the `workflow_step_runs` conflict target `(run_id, step_id)` and reads `workflow_runs.owner_id`, `workflow_runs.status`, `workflow_runs.attempt`, and `workflow_runs.workflow_id`.

The tracked migration directory does not contain the original table DDL for those relations. The inspected branch tree also does not expose a separate SQL migration defining the queue claim or stale recovery RPCs.

## 2. Readiness decision

**Do not author or apply the proposed `workflow_step_attempts` migration yet.**

Without authoritative base schema and recovery SQL, we cannot safely establish:
- actual primary/foreign keys and cascading behavior;
- whether `(run_id, step_id)` is backed by the expected unique constraint;
- status check constraints and enum definitions;
- RLS policies and grants on the existing workflow tables;
- queue claim and stale-recovery lock order;
- whether recovery increments the parent generation under the same row lock;
- whether any other worker or trigger writes these tables.

Guessing these details risks a migration that fails at deploy time or weakens the existing fencing guarantee.

## 3. Required source artifacts

Before writing executable SQL, locate and review:
1. Authoritative schema dump or complete historical migrations for the four referenced relations.
2. All functions/triggers that write `workflow_runs` or `workflow_step_runs`.
3. Queue-claim, lease-expiration, stale-recovery, and run-finalization RPCs.
4. RLS policies, grants, indexes, constraints, and relevant enum definitions.
5. Worker call sites for every queue/recovery RPC.

Acceptable evidence is the source SQL committed in the repository or a read-only schema export supplied from a disposable/non-production environment. Do not use production credentials or mutate a live database to discover schema.

## 4. Safer implementation alternatives

| Option | Decision |
|---|---|
| Guess base schema and create retry migration | Reject — unsafe |
| Add retry columns to current step summary without full schema | Reject — no verified constraints/ownership model |
| Add append-only attempt ledger after schema provenance is restored | Preferred target |
| Keep retry disabled and improve source-level tests/docs meanwhile | Safe interim state |
| Reconstruct schema from generated client types alone | Insufficient — types do not prove constraints, RLS, triggers, or lock order |

## 5. Next actions

1. Restore/locate the original Supabase migrations and schema definitions in the repository history or source branch.
2. Inspect every queue/recovery writer and document a lock-order graph.
3. Produce a constraint/RLS/grant inventory.
4. Revise the attempt-ledger proposal against the verified schema.
5. Prepare migration + rollback/forward-repair SQL only after source review.
6. Add disposable PostgreSQL/Supabase integration tests that invoke the real RPCs.
7. Keep retry integration disabled until concurrency tests pass.

## 6. Verification boundary

- GitHub branch tree inspection: completed.
- Phase 4N.8B fencing migration inspection: completed from PR patch.
- Base table definitions: not found in tracked migration directory.
- Queue/stale-recovery SQL: not found in tracked migration directory.
- Actual database schema: not inspected.
- RLS/constraints/indexes: not verified.
- Migration: not created or applied.
- Production writes/deployment/merge: none.

**Decision:** BLOCKED pending schema provenance. No assumptions should be promoted to verified database facts.
