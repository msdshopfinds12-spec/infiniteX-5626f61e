# Phase 4N.8C.5 — Cross-Branch Workflow Schema Provenance Map

**Status:** BLOCKED — authoritative base schema not located  
**Inspection mode:** GitHub read-only  
**No database connection or mutation was performed.**

## 1. Branches inspected

The GitHub repository tree was resolved through commit/tree objects for the following refs:

| Branch | Workflow migration files found |
|---|---|
| `feat/phase-4n8c-workflow-reliability-pr35` | `20261120000000_phase_4n8b_transactional_step_fencing.sql` |
| `fix/phase-4n8b-transactional-step-fencing-impl` | `20261120000000_phase_4n8b_transactional_step_fencing.sql` |
| `fix/phase-4n8b-transactional-step-fencing` | None |
| `feat/phase-4n8c-workflow-reliability` | None |
| `feat/phase-4n7-workflow-reliability` | None |
| `feat/phase-6g15-transactional-lifecycle` | None |
| `feat/infiniteX-control-plane-foundation` | None |
| `main` | None |

This inventory describes the resolved Git trees at inspection time; it does not prove that no schema exists in an external Supabase project, another repository, an uninspected commit, or an untracked local environment.

## 2. Additional repository topology finding

The repository default branch `main` contains the Vite/React frontend and its package scripts. The active workflow reliability branch is 50 commits ahead of `main` and 0 behind at the time of inspection, with backend workflow worker, migration, tests, and architecture documentation added on that branch.

PR #35 remains a separate stacked draft whose head is `fix/phase-4n8b-transactional-step-fencing-impl` and base is `fix/phase-4n8b-transactional-step-fencing`. Do not retarget or merge it as part of this audit.

## 3. What this proves — and what it does not

Verified:
- The active Phase 4N.8C branch tree has one tracked SQL migration under `supabase/migrations/`.
- The Phase 4N.8B implementation base has that same single migration.
- The inspected earlier branches listed above do not contain tracked files under `supabase/migrations/`.
- The Phase 4N.8B migration references pre-existing workflow tables rather than defining their base schema.

Not verified:
- Whether the base schema is managed in a different repository.
- Whether the live Supabase project contains manually created tables/functions.
- Whether an external migration history, schema dump, or dashboard SQL editor export exists.
- Whether any production or staging database matches the source branch assumptions.

## 4. Required provenance recovery path

Preferred order:
1. Locate the repository/branch that originally introduced the workflow tables.
2. Locate the Supabase migration history or schema dump for the exact project.
3. Obtain a read-only schema export from a disposable/non-production environment if source history is unavailable.
4. Cross-check table definitions, constraints, indexes, RLS, grants, triggers, and all RPC writers.
5. Only then revise the attempt-ledger migration proposal.

Do not infer DDL from TypeScript types, worker payloads, generated client types, or the fencing function's references.

## 5. Decision

**Keep retry integration disabled. Do not create or apply the attempt-ledger migration.**

The next valid input is authoritative SQL provenance: original migration files, schema dump, or an identified source repository/branch. Once supplied, continue with source review and disposable-database test planning. Production access remains out of scope.
