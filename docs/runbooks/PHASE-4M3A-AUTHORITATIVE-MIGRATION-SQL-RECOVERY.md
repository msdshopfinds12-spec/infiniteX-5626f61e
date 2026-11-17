# Phase 4M.3A — Authoritative Migration SQL Recovery Runbook

**Status:** PLANNED / READ-ONLY DISCOVERY REQUIRED  
**Risk:** High — database schema, RLS, grants, and queue RPC reproducibility  
**Target:** Disposable PostgreSQL/Supabase test environment only  
**Production changes:** Prohibited in this phase

## 1. Objective

Recover the exact SQL bodies corresponding to the migrations already recorded in the Ashaa-INX migration ledger, verify their provenance and checksums, and make the database schema reproducible from version control.

This runbook does not authorize creating guessed SQL, applying migrations, changing database roles, retrieving secrets, or deploying Edge Functions.

## 2. Current evidence and limitations

The Phase 4M.2D read-only audit recorded 19 applied migration versions and names. The inspected repository snapshot did not contain `supabase/migrations/` or tracked `.sql` files. The migration listing proves the ledger entries exist; it does **not** provide the SQL bodies.

The audit also recorded that the live database metadata had RLS enabled on inspected application tables and that queue claim RPCs used restricted privileges and `FOR UPDATE SKIP LOCKED`. These observations do not replace review of the exact SQL that created those controls.

**Do not infer migration bodies from current schema metadata, adapter code, function source, or migration names.**

## 3. Known migration ledger

The following versions and names were recorded by the read-only Phase 4M.2D audit. Treat this as an inventory to reconcile, not as recovered SQL:

| Version | Migration name |
|---|---|
| 20261025182821 | simula_app_factory_core_schema_rls |
| 20261025183121 | simula_fk_indexes_and_integrity_review |
| 20261025183834 | remove_seven_unused_nonconstraint_indexes |
| 20261025183942 | add_foreign_key_supporting_indexes |
| 20261025201001 | simula_workflow_cron_scheduler |
| 20261025201032 | simula_workflow_scheduler_safe_interval_validation |
| 20261025201831 | simula_secure_workflow_run_claiming |
| 20261025201906 | simula_move_claim_definer_to_private_schema |
| 20261025201915 | simula_allow_authenticated_claim_wrapper_access |
| 20261025202536 | simula_worker_foundation_indexes_and_pg_net |
| 20261025202606 | simula_internal_worker_queue_claiming |
| 20261025202644 | simula_pg_net_extension_schema_hardening |
| 20261025202741 | simula_secure_cron_worker_auth_and_vault |
| 20261025202809 | simula_schedule_secure_cron_worker |
| 20261025202850 | simula_worker_stale_run_recovery |
| 20261025204429 | restrict_workflow_table_client_privileges |
| 20261025204844 | harden_workflow_run_inserts_and_profile_updates |
| 20261103134251 | ashaa_backend_api_keys_and_webhook_idempotency |
| 20261103134302 | ashaa_backend_credit_ledger |

## 4. Approved recovery sources

Use sources in this order, preserving original bytes and provenance:

1. Original developer/operator migration archive or source-control repository that authored the migrations.
2. Authorized Supabase CLI or project backup/export workflow that can retrieve historical migration files, if those files were retained.
3. An owner-provided, read-only export from the canonical migration archive.

A live schema dump may help compare the resulting schema, but it is not a substitute for the historical migration bodies. A schema dump cannot reliably reconstruct migration intent, data transformations, historical grants, or intermediate security changes.

Do not retrieve database passwords, service-role keys, API keys, Vault values, or other secrets for this recovery task.

## 5. Recovery procedure

### Step A — Preserve evidence

For each recovered file, record:
- Exact migration version and filename.
- Original source location and retrieval timestamp.
- Byte size and SHA-256 checksum.
- Commit or archive identifier, if available.
- Whether the source is original, exported, or reconstructed.

Keep the recovered source read-only until provenance is reviewed.

### Step B — Reconcile the ledger

- Confirm all 19 versions exist in the authoritative migration history.
- Compare version, filename, and order exactly.
- Identify missing, duplicate, renamed, or out-of-order entries.
- Do not mark a file recovered based only on a matching filename.
- Record any discrepancy as BLOCKED pending owner confirmation.

### Step C — Verify SQL provenance and safety

A reviewer must inspect each exact SQL body for:
- DDL and data changes.
- RLS enablement, policies, and FORCE RLS behavior.
- Table, sequence, schema, and function grants.
- SECURITY DEFINER functions and fixed safe search_path.
- PUBLIC/anon/authenticated/service_role EXECUTE privileges.
- Dynamic SQL and identifier/value parameterization.
- Extensions and extension schema placement.
- Triggers, constraints, indexes, and foreign keys.
- Queue claiming locks, lease expiry, retries, and idempotency.
- Destructive statements and irreversible data transformations.

Do not execute recovered SQL during this review.

### Step D — Reproduce in isolation

Only after the full ordered migration set is recovered and reviewed:
1. Obtain explicit approval to create/use a disposable test database.
2. Pin the PostgreSQL/Supabase-compatible version and required extensions.
3. Apply migrations to a clean disposable database, never production.
4. Capture command output, migration checksums, database version, and resulting schema.
5. Compare tables, columns, constraints, indexes, policies, grants, functions, triggers, and extension versions against an authorized read-only reference export.
6. Stop on any mismatch; do not auto-repair or guess.

### Step E — Add integration tests

Use synthetic identities and tenant data only. Verify:
- Cross-tenant SELECT, INSERT, UPDATE, DELETE, and queue-claim denial.
- Correct same-tenant access for permitted roles.
- Inactive/missing membership denial.
- Runtime role cannot bypass RLS.
- RPC EXECUTE grants exclude unauthorized roles.
- Concurrent queue claims do not return the same run to multiple workers.
- Idempotency keys prevent duplicate durable effects.
- Worker interruption, retry, lease expiry, and stale-run recovery.
- Transaction-local identity does not leak across pooled connections.
- Audit writes and protected mutations have the intended atomicity.

Record exact test command, commit SHA, disposable database identity, migration checksums, pass/fail totals, and logs.

## 6. CI integration requirements

After the migration source is authoritative and the test harness is reproducible:
- Run migration lint/static checks without connecting to production.
- Start an ephemeral PostgreSQL service for integration tests.
- Apply the recovered migration set to the ephemeral database.
- Run RLS, grant, RPC, tenant-isolation, and concurrency tests.
- Upload non-secret test reports and logs as CI artifacts.
- Use least-privilege workflow permissions and pinned third-party actions.
- Fail closed if the database service or migration preconditions are unavailable.
- Never silently convert skipped integration tests into a passing result.

## 7. Stop conditions

Stop and report BLOCKED if:
- Any migration SQL body is missing or provenance is unclear.
- The migration ledger differs from the recovered files.
- A schema or privilege difference cannot be explained.
- A migration requires live data or a secret to interpret safely.
- A disposable environment is unavailable.
- A test requires production credentials or production data.
- A proposed action would create cost, alter production, or destroy data without explicit approval.

## 8. Evidence and completion checklist

- [ ] All 19 exact migration bodies recovered from an authoritative source.
- [ ] Version/name/order reconciled with the migration ledger.
- [ ] SHA-256 checksums recorded.
- [ ] SQL security review completed.
- [ ] Disposable database created with explicit approval.
- [ ] Clean migration replay completed and logs preserved.
- [ ] Schema, RLS, grants, and RPC parity reviewed.
- [ ] Synthetic two-tenant integration tests passed.
- [ ] Queue concurrency, retry, and idempotency tests passed.
- [ ] CI integration verified on the exact commit SHA.
- [ ] Human reviewer approves the evidence package.

Until every applicable item is evidenced, database reproducibility, live tenant isolation, and queue concurrency remain **NOT VERIFIED**.

## 9. Documentation and incident postmortem usage

This runbook is a preventive operational document: use it before attempting schema recovery or database integration testing.

Use `docs/incidents/POSTMORTEM-TEMPLATE.md` only when a real incident or material test/release failure warrants a blameless review. Link the incident timeline, logs, affected commit/run IDs, root-cause evidence, corrective-action owners, and verification results. Do not create a postmortem that presents a hypothetical example as a real incident.

## 10. Approval boundary

This document authorizes read-only discovery and evidence collection only. It does not authorize:
- Production SQL, migrations, or schema changes.
- Secret or credential access.
- Supabase function deployment or configuration changes.
- Paid infrastructure or billing changes.
- PR merge, branch protection changes, or production release.
