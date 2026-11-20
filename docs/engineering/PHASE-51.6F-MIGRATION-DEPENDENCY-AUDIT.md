# Phase 51.6F — Recovered Migration Dependency Audit

**Status:** STATIC SOURCE INVENTORY COMPLETE — DISPOSABLE REPLAY NOT TESTED  
**Inspection date:** 2026-11-20  
**Recovery source:** PR #54, branch `recovery/infinitex-database-source-of-truth`  
**Inspected recovery head:** `ec225c190db285210176574fd558f99b616d768f`  
**Phase 51 design target:** PR #69, branch `feat/phase-51-6d-contract-reconciliation`

## 1. Scope and method

Inspected the 19 recovered migration SQL files from PR #54's recovery branch. This was a static text-pattern inventory of SQL statements and qualified object references. It is useful for bootstrap planning but is not a PostgreSQL parser, migration replay, dependency graph proof, or live catalog verification.

The additional file `20261120120000_harden_platform_api_key_column_access.sql` was excluded because it is a separate proposed migration, not one of the 19 applied statements recovered from the migration ledger.

## 2. Dependency inventory

| Dependency family | Evidence in recovered SQL | Rehearsal requirement |
|---|---|---|
| Supabase Auth | `auth.users`, `auth.uid()` references in core schema, claim, ownership, API-key, and credit-ledger migrations | Use the official local Supabase Auth schema/functions or a clearly labeled compatibility fixture; never treat a hand-written stub as Auth parity |
| Private application schema | `CREATE SCHEMA IF NOT EXISTS private` | Verify schema owner, usage/create privileges, function search paths, and exposure settings |
| pg_cron | `CREATE EXTENSION pg_cron WITH SCHEMA pg_catalog`; `cron.job`, `cron.schedule`, `cron.unschedule` | Local runtime must support the extension and cron schema; otherwise skip scheduler execution and classify replay as partial |
| pg_net | `CREATE EXTENSION pg_net`; extension schema relocation to `extensions`; `net.http_post` | Verify extension availability, schema relocation, function signature, and background worker behavior; do not issue outbound requests during rehearsal |
| Supabase Vault | `vault.secrets`, `vault.decrypted_secrets`, `vault.create_secret` | Requires compatible Vault extension/schema and secret-management behavior; use synthetic disposable secrets only |
| Supabase project URL | A recovered cron-worker migration contains a literal project URL: `https://vepacoemkhudamfaccah.supabase.co` | Treat as environment coupling; do not send network requests. Confirm whether this is historical project configuration or a value that should be parameterized in a future separately reviewed change |
| PostgreSQL roles/grants | Multiple migrations alter function/table privileges and worker boundaries | Replay must compare role existence, ownership, grants, default privileges, and SECURITY DEFINER behavior; do not fabricate role equivalence |
| Trigger/RLS/constraint/index objects | Core schema and later hardening migrations define application integrity and access controls | Compare full definitions, not just object names or enabled flags |

## 3. Migration-by-migration static scan

The scan found the following dependency signals:

1. `20261025182821_simula_app_factory_core_schema_rls.sql` — private schema; Supabase Auth users and UID functions.
2. `20261025183121_simula_fk_indexes_and_integrity_review.sql` — no external dependency token found in the static scan.
3. `20261025183834_remove_seven_unused_nonconstraint_indexes.sql` — no external dependency token found.
4. `20261025183942_add_foreign_key_supporting_indexes.sql` — no external dependency token found.
5. `20261025201001_simula_workflow_cron_scheduler.sql` — pg_cron extension, private schema, cron catalog/scheduling functions.
6. `20261025201032_simula_workflow_scheduler_safe_interval_validation.sql` — no additional external dependency token found.
7. `20261025201831_simula_secure_workflow_run_claiming.sql` — Supabase Auth UID.
8. `20261025201906_simula_move_claim_definer_to_private_schema.sql` — Supabase Auth UID and private-schema function boundary.
9. `20261025201915_simula_allow_authenticated_claim_wrapper_access.sql` — no additional external dependency token found.
10. `20261025202536_simula_worker_foundation_indexes_and_pg_net.sql` — pg_net extension.
11. `20261025202606_simula_internal_worker_queue_claiming.sql` — no additional external dependency token found.
12. `20261025202644_simula_pg_net_extension_schema_hardening.sql` — pg_net extension schema relocation to `extensions`.
13. `20261025202741_simula_secure_cron_worker_auth_and_vault.sql` — Vault secrets/decrypted secrets/create-secret function; literal Supabase project URL.
14. `20261025202809_simula_schedule_secure_cron_worker.sql` — Vault decrypted secrets, cron scheduler, pg_net HTTP POST.
15. `20261025202850_simula_worker_stale_run_recovery.sql` — no additional external dependency token found.
16. `20261025204429_restrict_workflow_table_client_privileges.sql` — privilege changes; no external dependency token found.
17. `20261025204844_harden_workflow_run_inserts_and_profile_updates.sql` — Supabase Auth UID.
18. `20261103134251_ashaa_backend_api_keys_and_webhook_idempotency.sql` — Supabase Auth users/UID.
19. `20261103134302_ashaa_backend_credit_ledger.sql` — Supabase Auth users/UID.

“No additional external dependency token found” means only that this narrow static pattern scan did not match a listed token. It does not prove the migration has no prerequisites.

## 4. Bootstrap decision

**Preferred:** use the official Supabase local stack if it can be run without paid resources, with a pinned CLI version and locally generated credentials. Verify required extensions and services using documented CLI help and local status output before replay.

**Fallback:** PostgreSQL 17 disposable container plus an explicit compatibility layer. This is a partial PostgreSQL contract rehearsal, not full Supabase parity. Every emulated role/function/extension must be listed in the test report.

**Do not:**
- connect the rehearsal to the production Ashaa-INX database;
- execute cron jobs or pg_net HTTP requests during historical replay;
- copy production Vault secrets, service-role keys, or environment values into fixtures;
- run the separate proposed API-key privilege migration as part of the 19-file historical replay;
- apply the Phase 4N.8B fencing candidate during baseline replay;
- claim replay success until actual command output and catalog comparison are attached.

## 5. Recommended two-pass replay

### Pass A — historical baseline

1. Verify the migration manifest SHA-256 entries against the 19 exact recovered file bytes.
2. Verify the ordered version set against the 19 applied migration ledger entries documented by PR #54.
3. Prepare the disposable local Supabase/PostgreSQL 17 environment.
4. Disable outbound scheduler execution; use safe local-only configuration for any scheduler objects required by DDL.
5. Apply exactly the 19 recovered statements in order.
6. Capture full catalog metadata.
7. Compare against the sanitized live snapshot, reporting MATCH / DRIFT / NOT CAPTURED / NOT TESTED.
8. Preserve logs, CLI/server versions, environment manifest (no secrets), and resulting catalog snapshot.

### Pass B — candidate fencing layer

1. Clone/reset a second disposable database from the successful Pass A baseline.
2. Review the Phase 4N.8B candidate migration and its dependencies.
3. Apply only in the second disposable environment.
4. Run independent-session concurrency tests: duplicate start, stale completion, row-lock wait, rollback, generation advance, and stale-generation no-op.
5. Confirm no external network/provider side effects.
6. Compare before/after catalog and record candidate-only objects.

## 6. Remaining unknowns

- Official local Supabase CLI availability and exact pinned version in the current execution environment.
- Whether the required pg_cron, pg_net, and Vault capabilities are available in the local stack version used for rehearsal.
- Whether the literal project URL is intentionally retained in the recovered applied SQL or should be addressed by a future reviewed environment-configuration change.
- Full role ownership/default privilege equivalence between local and live environments.
- Complete live column/constraint/index/policy/function definition parity; the current sanitized snapshot is not a full pg_dump.
- Exact CI execution on the current PR #69 head.

## 7. Gate status

| Gate | Status |
|---|---|
| 19 recovered SQL files located | VERIFIED |
| Static dependency scan completed | VERIFIED |
| Auth/private-schema prerequisites identified | VERIFIED |
| pg_cron / pg_net / Vault prerequisites identified | VERIFIED |
| Environment-coupled project URL identified | VERIFIED |
| Supabase CLI config/seed present on recovery branch | NOT PRESENT |
| Exact manifest checksums independently recomputed in this phase | NOT TESTED |
| Local Supabase CLI/version verified | NOT TESTED |
| Clean disposable replay | NOT TESTED |
| Full catalog parity | NOT TESTED |
| Fencing candidate second-pass test | NOT TESTED |
| Production mutation | NOT AUTHORIZED / NOT PERFORMED |

## 8. Safety

This phase is static analysis and documentation only. No SQL was executed, no Supabase project was connected or mutated, no secret was accessed, no deployment or merge was performed. All future replay and candidate testing must remain in a newly created disposable environment.
