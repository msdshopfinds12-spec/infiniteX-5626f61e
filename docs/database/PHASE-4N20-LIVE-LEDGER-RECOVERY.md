# Phase 4N.20 — Live Migration Ledger Recovery

**Date:** 2026-11-20  
**Project:** Ashaa-INX (`vepacoemkhudamfaccah`)  
**Database:** PostgreSQL 17.11  
**Access:** Authorized read-only metadata and migration-ledger inspection only.

## Executive result

The `supabase_migrations.schema_migrations` ledger contains **19 applied migration records**. Every record has one non-empty stored SQL statement payload. All 19 statement payloads were restored as versioned files under `supabase/migrations/` on this draft recovery branch.

## Exact verification

- 19/19 SQL files exist in the recovery branch.
- 19/19 GitHub file contents were fetched and compared against the corresponding ledger `statements[0]` values.
- Result: **19/19 exact string matches**.
- SHA-256 values are recorded in `docs/database/MIGRATION-LEDGER-RECOVERY-MANIFEST.json`.
- Common credential-pattern scan found no matches. This is a pattern scan, not a substitute for human review.
- Original Git blob equivalence remains NOT VERIFIED; ledger payloads establish the stored applied statements, not original source-control byte history.
- No rollback SQL bodies are present in the ledger entries.
- Candidate migration `20261120000000` is not recorded as applied.
- Candidate RPC `simula_transition_workflow_step` is absent from the live public function catalog.

## Live catalog findings

- 14 public application tables were observed; all 14 have RLS enabled.
- `public.billing_webhook_events` has RLS enabled but zero policies. Security Advisor reports INFO. Table grants observed are limited to postgres and service_role; verify service-only access is intentional.
- `authenticated` has SELECT privilege on `public.platform_api_keys.key_hash` and table-level SELECT. This is a least-privilege concern: the stored digest is a verifier and should not be returned to browser clients. No permission was changed.
- `simula_verify_worker_secret(text)` is SECURITY DEFINER with empty search_path and service_role-only execution.
- `simula_claim_workflow_runs(integer)` is a SECURITY INVOKER wrapper. Its private SECURITY DEFINER helper checks `auth.uid()` and restricts claims to the authenticated owner; the internal queue recovery helper is service_role-only.
- Security Advisor: one INFO finding. Performance Advisor: six INFO unused-index findings; no index was dropped.

## CI verification

Exact-head GitHub Actions run [#44659254341](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44659254341):
- Migration integrity validator: PASS for 19 SQL files.
- Migration integrity regression suite: 8/8 PASS.
- Database contract regression suite: 8/8 PASS.
- Production safety invariant: PASS.
- Reviewed contract snapshot: BLOCKED because `supabase/contracts/database-contract.snapshot.json` is still absent.
- Final merge gate: BLOCKED as designed.

## Next actions

1. Review recovered SQL files and compare with the complete live catalog.
2. Build a disposable PostgreSQL 17 rehearsal database and test the recovered chain from empty state.
3. Compare rehearsal catalog with the live metadata snapshot.
4. Review `platform_api_keys.key_hash` exposure and service-only webhook access.
5. Reconcile the Phase 4N.8B candidate separately.
6. Prepare a forward-only migration plan only after successful rehearsal and human review.

## Safety record

No production DDL/DML, migration application, grant change, secret read, merge, deployment, or billing action was performed. Only migration metadata, stored SQL statement payloads, and PostgreSQL catalog metadata were read.
