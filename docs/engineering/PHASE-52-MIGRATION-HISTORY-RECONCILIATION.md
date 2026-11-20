# Phase 52 — Migration History Reconciliation and Safe Enqueue Gate

**Inspection date:** 2026-11-20  
**Repository:** `msdshopfinds12-spec/infiniteX-5626f61e`  
**Implementation branch:** `feat/phase-52-workflow-api-contract-auth`  
**Supabase project:** Ashaa-INX (`vepacoemkhudamfaccah`)  
**Status:** SOURCE PROVENANCE GAP VERIFIED / MIGRATION AUTHORING BLOCKED

## Executive decision

The live Supabase database has a recorded migration ledger with 19 versions. The inspected Git commit tree does not contain a `supabase/migrations/` directory or `supabase/config.toml`; its `supabase/` tree contains Edge Function source only.

These facts are not contradictory:

- The live database has a migration history.
- This repository snapshot does not contain the corresponding SQL migration source files.
- Migration version names are not a substitute for the SQL definitions that created the schema.

**Do not generate a guessed migration, replay migrations by name, run `db reset`, run migration repair, or apply DDL to the live project to fill this gap.**

## 1. Repository evidence

A recursive Git tree inspection at the Phase 52 implementation baseline returned:

- `supabase/functions/`
- `supabase/functions/_shared/`
- `supabase/functions/simula-workflow-api/`
- `supabase/functions/simula-workflow-worker/`
- `supabase/functions/simula-workflow-cron-worker/`

It did not return:

- `supabase/config.toml`
- `supabase/migrations/`
- Any `.sql` migration source file.

This is a repository provenance limitation, not evidence that the live database lacks schema objects.

## 2. Live migration ledger evidence

The prior read-only backend reconciliation recorded 19 migration versions in the live Supabase migration ledger:

1. `20261025182821_simula_app_factory_core_schema_rls`
2. `20261025183121_simula_fk_indexes_and_integrity_review`
3. `20261025183834_remove_seven_unused_nonconstraint_indexes`
4. `20261025183942_add_foreign_key_supporting_indexes`
5. `20261025201001_simula_workflow_cron_scheduler`
6. `20261025201032_simula_workflow_scheduler_safe_interval_validation`
7. `20261025201831_simula_secure_workflow_run_claiming`
8. `20261025201906_simula_move_claim_definer_to_private_schema`
9. `20261025201915_simula_allow_authenticated_claim_wrapper_access`
10. `20261025202536_simula_worker_foundation_indexes_and_pg_net`
11. `20261025202606_simula_internal_worker_queue_claiming`
12. `20261025202644_simula_pg_net_extension_schema_hardening`
13. `20261025202741_simula_secure_cron_worker_auth_and_vault`
14. `20261025202809_simula_schedule_secure_cron_worker`
15. `20261025202850_simula_worker_stale_run_recovery`
16. `20261025204429_restrict_workflow_table_client_privileges`
17. `20261025204844_harden_workflow_run_inserts_and_profile_updates`
18. `20261103134251_ashaa_backend_api_keys_and_webhook_idempotency`
19. `20261103134302_ashaa_backend_credit_ledger`

The names above are a ledger inventory only. They do not establish exact SQL, object ownership, dependency order beyond version order, or whether the SQL is available in another repository/backup.

## 3. Verified workflow database facts relevant to Phase 52

Prior read-only catalog inspection established:

- `public.workflow_runs` has `id`, `workflow_id`, `owner_id`, `status`, `input`, `output`, `attempt`, and `scheduled_for` fields.
- Existing unique scheduling key: `(workflow_id, scheduled_for)`.
- No `idempotency_key` or `request_hash` columns were present in the inspected live table.
- Authenticated users currently have direct INSERT privilege and an owner-scoped INSERT policy; an insert-default trigger normalizes worker-owned lifecycle fields.
- The scheduled enqueue path uses `scheduled_for` for scheduler duplicate suppression. Do not repurpose it for client request idempotency.
- The existing user and internal worker claim paths must remain separate.
- The live workflow tables were empty at the time of the catalog verification; this is not proof of future emptiness or populated-data compatibility.

## 4. Safe recovery path for migration source

Proceed in this order:

1. Search the original project workspace, prior authoritative repository, backups, and deployment artifacts for the exact 19 SQL migration files.
2. Verify each recovered file's version, content, and ordering against the live migration ledger. Record missing, duplicate, or divergent versions.
3. If the original files cannot be recovered, create a schema-only reference snapshot from a read-only catalog export in an isolated workspace. Do not present a generated snapshot as the original migration history.
4. Compare the snapshot with the live schema: tables, columns, defaults, constraints, indexes, triggers, policies, grants, functions, extensions, and scheduled jobs.
5. Build a disposable Supabase/PostgreSQL environment from the recovered source or an explicitly reviewed baseline.
6. Run all candidate DDL and RPC tests in that disposable environment only.
7. Keep production migration, grant/revoke, RLS, secret, and deployment actions behind separate explicit approval.

Do not use a destructive reset or migration repair command against the production project.

## 5. Phase 52 idempotency design — proposal only

After migration provenance and callsite inventory are resolved, evaluate an additive schema design:

- Nullable `idempotency_key` and `request_hash` columns on `workflow_runs`, preserving scheduler-created rows.
- A partial unique index on `(owner_id, idempotency_key)` where the key is not null.
- A strict CHECK constraint for key length/character policy and lowercase SHA-256 fingerprint format.
- A narrow atomic enqueue RPC that accepts only the verified owner, workflow ID, canonical input, key, and server-computed request hash.
- Same owner + same key + same hash returns the existing run.
- Same owner + same key + different hash returns a conflict without creating another run.
- Different owners may safely use the same key.
- Workflow ownership and active state are checked in the same transaction as enqueue.
- The RPC is executable only by the trusted server role; no browser direct insert is required.
- Keep the existing `(workflow_id, scheduled_for)` scheduler uniqueness contract unchanged.

The exact SQL, index name, CHECK expression, RPC signature, SECURITY mode, and grants remain unapproved until the full live definition and all consumers have been reviewed.

## 6. Required consumer inventory before permission changes

Search every relevant repository and branch, not just GitHub's default-branch code-search index, for:

- Direct `workflow_runs` inserts from browser/client code.
- Workflow enqueue Edge Functions and RPC callers.
- Scheduler writes and `scheduled_for` semantics.
- Worker and cron worker transitions.
- Tests, generated database types, scripts, and operational jobs.

Do not revoke authenticated INSERT until this inventory is complete and the replacement enqueue path is deployed and verified in a disposable environment. The eventual least-privilege rollout should be staged so no existing scheduler or worker path is broken.

## 7. Current gate

| Item | Status |
|---|---|
| Live migration ledger versions | VERIFIED from prior read-only inspection |
| Matching migration SQL in this repository snapshot | NOT PRESENT |
| Original migration source recovery | BLOCKED / NOT YET LOCATED |
| Workflow schema/RLS/grants | VERIFIED at prior inspection point |
| Complete cross-repository consumer inventory | NOT COMPLETE |
| Idempotency schema/RPC | DESIGN ONLY |
| Disposable PostgreSQL migration test | NOT RUN |
| Production migration / grants / RLS | NOT AUTHORIZED |

## Safety statement

This document is a source-provenance and design artifact. It does not include executable migration SQL and makes no database, permission, secret, deployment, merge, or release change.
