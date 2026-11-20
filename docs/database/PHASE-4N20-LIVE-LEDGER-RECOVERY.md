# Phase 4N.20 — Live Migration Ledger Recovery

**Date:** 2026-11-20  
**Project:** Ashaa-INX (`vepacoemkhudamfaccah`)  
**Database:** PostgreSQL 17.11  
**Access:** Authorized read-only metadata and migration-ledger inspection only.

## Executive result

The `supabase_migrations.schema_migrations` ledger contains **19 applied migration records**. Every record has one non-empty stored SQL statement payload. This enables recovery of the applied SQL bodies without inventing migration history.

The 19 payloads are being restored as versioned SQL files under `supabase/migrations/` on this draft recovery branch. SHA-256 checksums are recorded in `docs/database/MIGRATION-LEDGER-RECOVERY-MANIFEST.json`.

## Verified ledger facts

- 19 migration records, from `20261025182821` through `20261103134302`.
- Every record has exactly one non-empty SQL statement.
- Common credential-pattern scan found no matches.
- Vault-related SQL stores secret names/descriptions and a project URL reference; no literal worker-secret value was detected.
- No rollback SQL bodies are present in the ledger entries.
- Candidate migration `20261120000000` is not recorded as applied.
- Candidate RPC `simula_transition_workflow_step` is absent from the current public function catalog.

## Provenance limits

These files reproduce SQL statement payloads stored in the applied database ledger. They are strong evidence of SQL recorded as applied, but are **not proven byte-identical** to historical Git source files. The manifest marks original Git blob equivalence as NOT VERIFIED.

This is not a full schema-only dump and does not prove that replaying the files against the current database is safe. Do not replay them against source production.

## Live catalog findings

- 14 public application tables; all 14 have RLS enabled.
- `public.billing_webhook_events` has RLS enabled but zero policies. Security Advisor reports INFO. Table grants observed are limited to postgres and service_role; verify service-only access is intentional.
- `authenticated` has SELECT privilege on `public.platform_api_keys.key_hash` and table-level SELECT. This is a least-privilege concern: the stored digest is a verifier and should not be returned to browser clients. No permission was changed.
- `simula_transition_workflow_step` is absent. Four public routines were observed. `simula_verify_worker_secret(text)` is SECURITY DEFINER with empty search_path and service_role-only execution. `simula_claim_workflow_runs(integer)` is SECURITY INVOKER and executable by authenticated users.
- Security Advisor: one INFO finding. Performance Advisor: six INFO unused-index findings; no index was dropped.

## Next actions

1. Review recovered SQL files against the live catalog metadata snapshot.
2. Reconcile candidate branch migrations not present in the applied ledger; do not apply automatically.
3. Rehearse the recovered chain from an empty disposable PostgreSQL 17 database.
4. Compare rehearsal catalog with the read-only live snapshot.
5. Review `platform_api_keys.key_hash` exposure and service-only webhook access.
6. Prepare a forward-only migration plan only after successful rehearsal and human review.

## Safety record

No production DDL/DML, migration application, grant change, secret read, merge, deployment, or billing action was performed. Only migration metadata, stored SQL statement payloads, and PostgreSQL catalog metadata were read.
