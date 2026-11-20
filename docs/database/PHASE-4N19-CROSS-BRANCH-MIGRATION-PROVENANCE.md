# Phase 4N.19 — Cross-Branch Migration Provenance Recovery

**Date:** 2026-11-20  
**Scope:** Read-only GitHub branch, commit, migration, fixture, and preflight inspection. No database connection or write was performed.

## Executive finding

The targeted branch investigation recovered **one candidate Supabase migration**, repeated across several related branches:

`supabase/migrations/20261120000000_phase_4n8b_transactional_step_fencing.sql`

It defines `public.simula_transition_workflow_step(uuid, uuid, uuid, integer, text, jsonb, jsonb, text)`, a SECURITY DEFINER RPC with an empty search_path. It locks the parent `workflow_runs` row, validates owner/status/attempt and workflow-step membership, writes the step transition, revokes EXECUTE from public/anon/authenticated, and grants it to service_role.

This is a feature migration candidate, **not** a complete historical migration chain, canonical schema baseline, or proof of production deployment. It must not be copied into the canonical migration directory as a substitute for missing history.

## Branch and commit evidence

Targeted recursive-tree inspection covered 24 candidate branches across database, backend, reliability, workflow, and foundation work. The only Supabase migration path found in that inspection was the Phase 4N.8B candidate above. The separate Alembic migration on `phase-4/database-persistence` is a different backend migration system and is not Supabase history.

Relevant refs:

| Ref | Finding |
|---|---|
| `audit/phase-4n8b-live-schema-preflight` | Candidate migration and read-only preflight assets |
| `feat/phase-4n8c-workflow-reliability-pr35` | Same candidate migration blob as audit branch |
| `fix/phase-4n8c-local-integration-test-safety` | Same candidate migration blob |
| `fix/phase-4n8c-retry-policy-ci-hardening` | Same candidate migration blob |
| `eng/phase-4n27-transactional-fencing-verification` | Ported candidate migration with equivalent function logic |
| `fix/phase-4n8b-transactional-step-fencing-impl` / PR #35 | Candidate implementation PR; base is a feature branch, not main |

The audit/PR35 family uses Git blob SHA `a84b6991bd54f6b8ef3262343d5d4dadbb4d73e3`. The Phase 4N.27 port uses blob SHA `3e3cfca010ad424651e41773c28a4a191a25b519`. A line comparison found only the repository-safety comment and whitespace differences in the final migration files; the function logic is equivalent.

Observed file history:
- `0335b03366235d736a1db1d949e22c029e7b77e6` — initial transactional step-fencing migration and worker change.
- `6f64628e6735de572fedbd7b00aad93fec34a23a` — subsequent deterministic race-coverage/test work.
- `01baa0c015dfef9892e3053eacc21ca126bf1e46` — Phase 4N.27 port of the migration.

The candidate migration is a single feature change, not the original schema lineage.

## Candidate support artifacts and their limits

The audit branch also contains:

- `supabase/tests/phase-4n8b-live-schema-preflight.sql`: SELECT-only catalog inspection of required relations/columns, unique key, constraints, RPC grants, migration ledger presence, and claim/recovery functions.
- `supabase/tests/fixtures/phase-4n8b-contract-schema.sql`: explicitly synthetic fixture; it drops and recreates only four workflow tables and therefore is not a production schema export or canonical bootstrap.
- `supabase/tests/phase-4n8b-transactional-step-fencing.test.sql`: catalog contract test for RPC presence, grants, columns and unique key.
- `docs/architecture/PHASE-4N8B-LIVE-SCHEMA-RECONCILIATION.md`: records prior read-only observations and explicitly lists PostgreSQL 17 concurrency, complete mutation-path inventory, and isolated local Supabase integration as outstanding.

The read-only preflight is a useful next evidence-gathering artifact, but it has not been executed in this phase. The synthetic fixture must never be treated as evidence of live schema compatibility.

## Provenance and readiness classification

| Artifact / claim | Status |
|---|---|
| One Phase 4N.8B candidate migration recovered | VERIFIED in GitHub branch history |
| Candidate SQL copied into canonical PR #54 migration chain | NOT DONE |
| Complete historical migration chain recovered | BLOCKED |
| Canonical schema-only snapshot recovered | BLOCKED |
| Supabase migration ledger re-read in this phase | NOT DONE |
| Live schema compatibility of candidate RPC | NOT VERIFIED |
| PostgreSQL 17 concurrent-session proof | NOT TESTED |
| Candidate RPC deployed in production | NOT VERIFIED |
| Production migration or worker deployment | NOT AUTHORIZED |

## Critical next recovery sequence

1. Obtain an authorized, read-only export of migration ledger metadata (versions and available checksums) and a schema-only catalog export. Do not read application rows or secrets.
2. Compare that evidence with all recoverable migration files and commit history. Preserve exact filenames, Git refs, blob IDs, and SHA-256 checksums generated from the retrieved bytes.
3. Determine whether the original historical chain can be recovered. If not, prepare a separately named, reviewed baseline snapshot from the authorized schema-only export; do not invent prior migration bodies or pretend the baseline is historical.
4. Rehearse the baseline plus the Phase 4N.8B candidate in a disposable local PostgreSQL 17/Supabase environment.
5. Run two-session locking, duplicate-start, stale-generation, rollback, grants, SECURITY DEFINER/search_path, RLS, and all claim/recovery/retry/cancel mutation-path tests.
6. Only after review, propose a migration ordering and forward-recovery plan. Keep migration approval and worker deployment approval separate.

## Safety

No Supabase connection was opened in this phase. No production query, row read, migration, grant change, secret change, merge, or deployment was performed. The candidate remains repository-only and unapproved.

## Pull-request history cross-check

The repository returned 51 pull requests across all states. File lists were additionally inspected for 10 relevant backend/database/workflow PRs (#34, #36, #38, #46, #53, #49, #30, #29, #20, and #19). No additional Supabase migration SQL or canonical schema snapshot was found in those PR file lists. PR #20 contains a read-only database deployment audit document, not migration SQL. PR #35 is the transactional feature migration candidate described above.

This PR inventory is a second cross-check, not proof that no unreferenced commit or deleted branch ever contained other SQL. The recovery decision remains unchanged: only one candidate feature migration has been positively recovered; historical baseline remains blocked.
