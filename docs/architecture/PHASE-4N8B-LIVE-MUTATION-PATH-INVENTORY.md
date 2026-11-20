# Phase 4N.8B live workflow mutation-path inventory

Date: 2026-11-20
Environment: Supabase project `Ashaa-INX`, ref `vepacoemkhudamfaccah`
Method: read-only catalog/function inspection and GitHub candidate-source inspection. No SQL DDL/DML, migration, deployment or secret access was performed.

## Executive decision

The live database has a working workflow persistence foundation and several database-side queue/recovery functions. The live queue/recovery paths use row-level locking on `workflow_runs`, which is compatible in principle with the candidate transition RPC's parent-row serialization strategy. However, the live project does not currently have `public.simula_transition_workflow_step`, and the deployed workers still differ from the candidate source. Therefore this is not a production-complete fencing implementation.

Historical migration source recovery remains blocked: the live migration ledger exposes 19 version/name records, but GitHub inspection of the InfiniteX candidate branch found only one tracked SQL migration. Searches of the known IQ Core and digital-finds repositories did not locate the missing migration names or workflow schema SQL. Search results are scoped to indexed/default-branch content and do not prove no other historical copy exists.

## 1. Live migration ledger

The live Supabase migration ledger reports these 19 entries:

| Version | Migration |
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

The ledger is verified; the original SQL bodies and checksums are not recovered in the inspected repositories. Do not reconstruct historical migration bodies from names alone.

## 2. Live workflow schema and indexes

Read-only table inspection verified the following relevant relations and columns:

- `workflows`: owner, status, trigger type/configuration, settings, next_run_at.
- `workflow_steps`: workflow_id, step_order, action_type, config, retry_limit, timeout_seconds.
- `workflow_runs`: workflow_id, owner_id, status, input/output, attempt, started_at, finished_at, scheduled_for.
- `workflow_step_runs`: run_id, step_id, owner_id, status, input/output, attempt and timestamps.
- `workflow_logs`: owner/workflow/run references and event details.

All inspected public tables have RLS enabled.

The exact live unique index supporting the RPC's conflict target exists:
`workflow_step_runs_run_id_step_id_key UNIQUE (run_id, step_id)`.

Other relevant indexes include:
- `workflow_runs_queue_idx` partial index for queued rows;
- `workflow_runs_workflow_scheduled_for_uidx` unique scheduled-run identity;
- `workflow_steps_workflow_id_step_order_key` unique workflow step order;
- `workflow_step_runs_run_idx` and owner/step indexes.

## 3. Live database mutation paths

Read-only `pg_proc` inspection found these workflow-related functions:

### 3.1 Authenticated queue claim

`private.simula_claim_workflow_runs(p_limit integer)`

- SECURITY DEFINER, owner postgres, empty search_path.
- Derives owner from `auth.uid()`; rejects missing authenticated identity.
- Selects that owner's queued runs using `FOR UPDATE SKIP LOCKED`.
- Updates selected parent rows to running and increments `attempt`.
- Public wrapper `public.simula_claim_workflow_runs` is SECURITY INVOKER and delegates to the private function.

This path locks the parent `workflow_runs` row before changing claim generation.

### 3.2 Internal service queue claim and stale recovery

`private.simula_claim_workflow_runs_internal(p_limit integer)`

- SECURITY DEFINER, owner postgres, empty search_path.
- First marks running rows older than 15 minutes with attempt >= 5 as failed.
- Requeues running rows older than 15 minutes with attempt < 5.
- Then claims queued rows with `FOR UPDATE SKIP LOCKED`, sets running and increments attempt.
- Public wrapper `public.simula_claim_workflow_runs_internal` is SECURITY INVOKER.

The recovery UPDATE statements acquire row locks on affected `workflow_runs` rows. The later claim CTE also locks selected queued rows. This is compatible in principle with the candidate RPC locking the same parent row, but race behavior still needs an independent-session PG17 test.

### 3.3 Scheduled workflow enqueue

`private.simula_enqueue_due_workflows()`

- SECURITY DEFINER, owner postgres, empty search_path.
- Selects due workflow definitions using `FOR UPDATE SKIP LOCKED`.
- Inserts queued `workflow_runs` rows with unique scheduled identity and `ON CONFLICT DO NOTHING`.
- Advances `workflows.next_run_at`.

This function creates parent run rows; it does not directly mutate existing step-run rows.

### 3.4 Insert guard

`private.enforce_workflow_run_insert_defaults()`

- Trigger function, SECURITY INVOKER, empty search_path.
- For authenticated inserts, enforces `owner_id = auth.uid()`, verifies workflow ownership, and resets worker-managed fields to safe queued defaults.

### 3.5 Triggers

Read-only trigger inventory found:
- `workflow_runs`: BEFORE INSERT `enforce_workflow_run_insert_defaults`.
- `workflows`: BEFORE UPDATE `workflows_updated_at`.
- No triggers were returned for `workflow_steps` or `workflow_step_runs`.

## 4. Candidate branch mutation-path review

Inspected candidate branch source:
- authenticated worker;
- cron worker;
- transactional fencing migration;
- worker security helper;
- integration and SQL preflight tests.

Candidate workers use `simula_transition_workflow_step` for step start/succeed/fail and static inspection found no direct REST insert/update/upsert/delete calls against `workflow_step_runs`.

The candidate migration's RPC locks the parent `workflow_runs` row and validates owner, running status and attempt generation before child-row mutation.

Candidate workers also use attempt/status-conditional terminal updates against the parent run. The live recovery/claim functions mutate that same parent row, so PostgreSQL row locking plus predicates should serialize the competing state changes. This conclusion is design-level until verified with controlled concurrent sessions on PostgreSQL 17.

## 5. Live deployment mismatch

Live Supabase inspection reports:
- `public.simula_transition_workflow_step` is absent.
- The three deployed Edge Functions remain active, with previously recorded deployed source hashes:
  - authenticated worker: `91e3dcf52d08f2a426476298fbb3e64ef5f29fa99bf7f2adfb24b80c15a37b5e`
  - cron worker: `c4e7e7aac6a6c9104fc3f8efd8bfed790256a44d3bda521ef5da6488f6b7de26`
  - API key manager: `a4b4ce8cc8e47413e22e54a867f306e7ce51b3880d96a953b4638e2729a51da0`

No live migration or function deployment was performed in this audit.

## 6. Unresolved engineering risks

1. Historical migration SQL source and checksums are missing from inspected repository trees.
2. RPC function ownership and ACLs are candidate-only; live ACLs cannot be verified until the function exists.
3. Recovery/claim vs candidate step transition requires PostgreSQL 17 independent-session race testing.
4. Retry semantics remain undefined: the workers load `retry_limit` but do not implement bounded retries.
5. Timeout helper is cooperative and cannot preempt a blocked synchronous action.
6. All future administrative repair/cancel/retry paths must preserve parent-row lock ordering and avoid direct child-row writes.
7. A crash after an external side effect but before persistence requires idempotency at the action/provider boundary; database fencing alone cannot undo a side effect.

## 7. Required recovery and verification plan

1. Recover original SQL files from authoritative backups, original deployment artifact, source control refs or approved database backup/export. Do not fabricate them from migration names.
2. For each ledger entry, record exact filename, version, source URL/repository/ref, blob SHA-256 and whether it matches live catalog state.
3. Reconstruct a clean-room PostgreSQL 17/Supabase environment from the recovered chain.
4. Apply the Phase 4N.8B RPC only after comparing all referenced columns, constraints, index conflict target, role ownership, schema grants and RLS behavior.
5. Run independent-session race tests for:
   - claim vs recovery;
   - recovery vs old-worker transition;
   - new-generation claim vs old-worker success/failure;
   - concurrent duplicate step starts;
   - cancellation/timeout vs completion.
6. Add failure injection for worker crash between external side effect and database commit.
7. Only after test/audit gates pass, prepare a separate production migration/deployment plan for human approval.

## 8. Evidence classification

| Claim | Status |
|---|---|
| Live 19-entry migration ledger | VERIFIED |
| Original historical migration SQL bodies recovered | BLOCKED |
| Live workflow tables and unique run/step index | VERIFIED |
| Live claim and stale recovery function definitions | VERIFIED |
| Claim/recovery use parent-row updates/locks | VERIFIED by source |
| Candidate workers use transactional step RPC | VERIFIED by source |
| Live transactional step RPC installed | ABSENT |
| Candidate-vs-live worker parity | NOT VERIFIED |
| PostgreSQL 17 concurrent lifecycle behavior | NOT TESTED |
| Production migration or Edge Function deployment | NOT AUTHORIZED |

## Release recommendation

Keep production unchanged. Recover the migration provenance and establish a PostgreSQL 17 disposable fixture first. The candidate implementation is promising, but production readiness requires reproducible schema history, exact grants, end-to-end race tests, and an approved deployment plan.
