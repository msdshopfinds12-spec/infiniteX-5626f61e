# Phase 4M.2D — Read-only Supabase Security and Deployment-Parity Audit

**Audit date:** 2026-11-18  
**Project:** Ashaa-INX (`vepacoemkhudamfaccah`)  
**Database:** PostgreSQL 17.11; project status reported `ACTIVE_HEALTHY`  
**Repository branch inspected:** `fix/phase-4m2c-deno-tenant-isolation`  
**Production boundary:** All database queries in this audit were SELECT/read-only metadata queries. No migration, SQL write, secret retrieval, deployment, or configuration change was performed.

## Executive summary

The database metadata shows several good security controls: RLS is enabled on the inspected public tables; user-facing policies use `auth.uid()` ownership predicates; worker queue RPC privileges are restricted; the internal queue claim RPC is service-role-only; and API keys are stored as unique 64-character SHA-256 digests rather than plaintext.

Two release blockers remain:
1. The deployed Edge Function source is older than the hardened repository source. The deployed authenticated worker still has wildcard CORS and lacks the explicit parent-workflow owner check and actual streamed request-size enforcement. The deployed API-key manager still has wildcard CORS and no streamed body-size guard. The deployed cron worker still relies on `Content-Length` for request-size checks.
2. The live database reports 19 applied migrations, but the inspected GitHub branch has no `supabase/migrations` directory. The migration ledger (versions and names) has now been recovered read-only; the exact SQL bodies are still not present in the branch, so the schema cannot currently be reproduced from this repository snapshot alone.

## Verified positive controls

### Database tables and RLS
- The inspected public application tables all reported RLS enabled.
- Owner-scoped policies use `(select auth.uid())` comparisons for profiles, projects, usage, subscriptions, payments, workflows, workflow runs, workflow step runs, workflow logs, API keys, and credit ledger.
- The `workflow_runs` insert policy checks both the caller's owner ID and that the referenced workflow belongs to the same owner.
- Authenticated users have narrowly scoped table grants; service_role has operational grants for server-side workers.
- No `anon` table grants were returned for the inspected worker, API-key, billing-webhook, or credit-ledger tables.

### Worker RPCs and privileges
- `private.simula_claim_workflow_runs(integer)` is SECURITY DEFINER with an empty search_path; it requires `auth.uid()`, filters queue claims by that owner, and uses `FOR UPDATE SKIP LOCKED`.
- The authenticated claim function is executable by authenticated and service_role, not anon.
- `private.simula_claim_workflow_runs_internal(integer)` is SECURITY DEFINER with an empty search_path and executable only by service_role; it handles the global cron queue and stale-run recovery.
- The public internal wrapper is also executable only by service_role.
- `public.simula_verify_worker_secret(text)` is SECURITY DEFINER with an empty search_path and executable only by service_role; anon and authenticated cannot execute it.
- These grants materially reduce the risk of exposing internal queue claims or worker-secret verification as public RPC endpoints.

### Constraints and idempotency
- `workflow_step_runs` has a unique constraint on `(run_id, step_id)`, matching worker upsert conflict handling.
- `workflow_steps` has a unique constraint on `(workflow_id, step_order)`.
- `platform_api_keys.key_hash` is unique and constrained to 64 characters.
- `credit_ledger` has unique `(owner_id, idempotency_key)`.
- `billing_webhook_events` has unique `(provider, provider_event_id)`.

## Findings and severity

### HIGH — Production Edge Function source is behind the hardened repository branch
The live Supabase function snapshots were inspected directly:
- `simula-workflow-worker`: deployed source still contains wildcard CORS, the older request JSON parser, and no explicit run/parent-workflow ownership validation matching the PR #20 branch.
- `simula-workflow-cron-worker`: deployed source still checks declared `Content-Length` rather than enforcing the actual streamed byte count. It does perform a parent workflow owner predicate, but does not contain the newer shared claimed-run shape validation.
- `ashaa-api-key-manager`: deployed source still contains wildcard CORS and parses JSON without the shared streamed body-size limit.

**Impact:** Repository CI success does not mean production has the hardening. Treat these live functions as NOT UPDATED until a separately approved deployment is performed and the resulting deployed source/version is re-inspected.

**Required action:** Review and merge the hardened PR only after human approval; then deploy functions individually with explicit approval, configured allowed origins, and post-deploy source/version verification. Do not deploy as part of this audit.

### HIGH — Applied database migrations are not reproducible from the inspected repository branch
- Supabase's read-only migration listing confirms these 19 applied migration versions and names:
  - `20261025182821` — `simula_app_factory_core_schema_rls`
  - `20261025183121` — `simula_fk_indexes_and_integrity_review`
  - `20261025183834` — `remove_seven_unused_nonconstraint_indexes`
  - `20261025183942` — `add_foreign_key_supporting_indexes`
  - `20261025201001` — `simula_workflow_cron_scheduler`
  - `20261025201032` — `simula_workflow_scheduler_safe_interval_validation`
  - `20261025201831` — `simula_secure_workflow_run_claiming`
  - `20261025201906` — `simula_move_claim_definer_to_private_schema`
  - `20261025201915` — `simula_allow_authenticated_claim_wrapper_access`
  - `20261025202536` — `simula_worker_foundation_indexes_and_pg_net`
  - `20261025202606` — `simula_internal_worker_queue_claiming`
  - `20261025202644` — `simula_pg_net_extension_schema_hardening`
  - `20261025202741` — `simula_secure_cron_worker_auth_and_vault`
  - `20261025202809` — `simula_schedule_secure_cron_worker`
  - `20261025202850` — `simula_worker_stale_run_recovery`
  - `20261025204429` — `restrict_workflow_table_client_privileges`
  - `20261025204844` — `harden_workflow_run_inserts_and_profile_updates`
  - `20261103134251` — `ashaa_backend_api_keys_and_webhook_idempotency`
  - `20261103134302` — `ashaa_backend_credit_ledger`
- The inspected GitHub branch has no `supabase/migrations` directory; the listing API provides migration names/versions, not the SQL bodies. Exact SQL recovery is still required.

**Impact:** The repository does not provide a verifiable migration history for reproducing the current database schema in a fresh environment or reviewing the exact SQL that established its privileges and functions.

**Required action:** Recover the exact migration SQL from an authoritative source or use a controlled schema-diff workflow. Do not fabricate migration files from current schema metadata and do not apply reconstructed SQL to production. Compare every recovered migration version with the database migration history before proposing changes.

### INFO — `billing_webhook_events` has RLS enabled but no policies
Supabase Security Advisor reports one `rls_enabled_no_policy` finding. The inspected grants show service_role-only table access and no anon/authenticated table grants. This is fail-closed and may be intentional for a backend-only webhook idempotency table; it is not, by itself, evidence of a vulnerability.

**Required action:** Confirm that no browser/client workflow needs direct access. Keep it backend-only unless a documented requirement proves otherwise. Do not add a broad authenticated policy merely to silence the advisor.

### INFO — Six indexes are reported unused
Supabase Performance Advisor reported six unused indexes. The inspected application tables reported zero rows, so low/no index usage may simply reflect an empty or newly initialized workload.

**Required action:** Do not drop these indexes solely from the advisor output. Reassess after representative traffic and query-plan evidence.

## Verification gaps

- Deno-native `deno test` and `deno check` passed in GitHub Actions run #144 on commit `e0d275fc98c5b20d28c209f00b540340f97b8bfd`; the follow-up documentation commit is undergoing its own CI run.
- No live two-user tenant-isolation integration test has been run.
- Queue concurrency, retry idempotency, stale lease recovery, and worker failure recovery have not been load-tested.
- API-key use-time authentication, scope enforcement, expiry enforcement, and last-used timestamp behavior were not fully traced in this audit.
- The database metadata audit does not substitute for reviewing every migration SQL statement.
- The exact configured `INFINITEX_ALLOWED_ORIGINS` production value was not read; secrets/configuration values were intentionally not retrieved.

## Release gate

Do not merge or deploy based only on the passing PR #20 CI run. Before release:
1. Resolve the source-vs-production function drift.
2. Recover and reconcile the migration history.
3. Preserve successful Deno-native CI evidence and add synthetic two-user integration tests.
4. Verify allowed-origin configuration without exposing secrets.
5. Obtain explicit human approval for merge and a separate explicit approval for each production deployment.

No production changes were made during this audit.
