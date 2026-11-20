# Phase 4N.17 — Cross-Branch Database Artifact Provenance Inventory

**Date:** 2026-11-20  
**Target PR:** #54 — database source-of-truth recovery  
**Method:** Read-only GitHub tree and file inspection across known repository branch heads.

## Executive finding

A prior feature branch contains one Supabase migration and its associated test/preflight assets:

- Branch: `audit/phase-4n8b-live-schema-preflight`
- Inspected branch-head commit: `dc9bc8ddf8f943599db53ec0880bcf48543dfe5e`
- Migration: `supabase/migrations/20261120000000_phase_4n8b_transactional_step_fencing.sql`
- Migration blob: `a84b6991bd54f6b8ef3262343d5d4dadbb4d73e3`

This is a real repository artifact, but it is a **single feature migration**, not the complete historical database migration chain. It must not be copied or represented as the canonical baseline.

## Cross-branch inventory

| Ref inspected | Database-related evidence | Finding |
|---|---|---|
| `main` (`4538bd0c...`) | No paths matching Supabase, migrations, schema or SQL in recursive tree | No canonical Supabase migration chain present at this head |
| `phase-4/database-persistence` (`7c47765a...`) | Alembic backend migration `backend/migrations/versions/0001_create_task_records.py` | Separate Python backend migration lineage; not Supabase history |
| `fix/infinitex-supabase-source-parity` (`76afd86d...`) | Supabase client config/types, Edge Functions, integration/audit docs; no migration SQL path | Useful implementation evidence, not migration history |
| `audit/phase-4n8b-live-schema-preflight` (`dc9bc8dd...`) | One Supabase feature migration, synthetic fixture, read-only preflight, catalog test, reconciliation report | Candidate feature migration only |
| `docs/phase-4n-architecture-baseline` (`301ab656...`) | Supabase Edge Function sources; no migration SQL path in tree inventory | Architecture/source evidence, not full schema baseline |
| `fix/phase-4m2b-edge-worker-hardening` (`f30e4257...`) | Edge Function worker hardening; no migration SQL path in tree inventory | Runtime source evidence only |

This inventory is bounded to the refs and repository paths inspected. It does not prove that no other historical source exists in external backups, unlisted refs, deleted branches, or the Supabase migration ledger.

## Recovered candidate artifact details

The feature migration defines:

`public.simula_transition_workflow_step(uuid, uuid, uuid, integer, text, jsonb, jsonb, text)`

Its design includes:
- Parent `workflow_runs` row lock as the serialization point.
- Owner, run-status and attempt-generation checks.
- Workflow/step relationship checks.
- Start/succeed/fail transition handling.
- Service-role-only EXECUTE grant, with public/anon/authenticated revoked.
- Empty function `search_path` for SECURITY DEFINER safety.

Associated files on the inspected branch:
- `supabase/tests/fixtures/phase-4n8b-contract-schema.sql` — explicitly synthetic fixture, not canonical bootstrap.
- `supabase/tests/phase-4n8b-live-schema-preflight.sql` — read-only catalog checks, no application-row reads.
- `supabase/tests/phase-4n8b-transactional-step-fencing.test.sql` — post-migration catalog contract.
- `docs/architecture/PHASE-4N8B-LIVE-SCHEMA-RECONCILIATION.md` — states the live RPC was absent in the prior read-only inspection and that candidate source differs from deployed workers.

## Critical provenance classification

| Artifact | Classification | Safe use |
|---|---|---|
| Feature migration SQL | Candidate migration source | Review against exact target schema; do not treat as historical baseline |
| Synthetic fixture SQL | Test fixture only | Disposable local database only |
| Live-schema preflight SQL | Read-only diagnostic | Controlled target with read-only role |
| Catalog test SQL | Post-migration contract test | Disposable local database only |
| Reconciliation report | Historical audit evidence | Use with timestamp and provenance caveat |

## Next safe recovery route

1. Preserve the feature migration and its original branch provenance; do not cherry-pick it into a canonical migration chain yet.
2. Obtain the authorized Supabase migration ledger metadata and schema-only export using read-only access.
3. Compare the ledger versions with all recovered SQL files and branch refs.
4. Search authorized backups and repository history for the missing original migration bodies.
5. If the original chain remains unrecoverable, design a separately labeled baseline from a reviewed schema-only export. Record the exact export timestamp, source project, object scope, and reviewer.
6. Rehearse the baseline plus later feature migration against a disposable PostgreSQL/Supabase environment.
7. Require independent review before any production migration or worker rollout.

## Explicit non-claims

- This does not recover all historical migration SQL.
- This does not establish live schema parity.
- This does not prove the candidate RPC is deployed.
- This does not authorize applying the candidate migration.
- This does not authorize worker deployment, merge, or release.

No database was queried or changed during this GitHub repository inspection. No production data, credentials, or secrets were accessed.
