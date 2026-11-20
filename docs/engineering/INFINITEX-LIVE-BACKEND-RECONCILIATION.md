# InfiniteX Live Backend Reconciliation

**Review date:** 2026-11-20  
**Scope:** Read-only inspection of the connected Supabase project and GitHub integration candidate.  
**Project:** `Ashaa-INX` (`vepacoemkhudamfaccah`)  
**Candidate:** PR #50, `eng/infinitex-unified-ui-backend-2026-11-20`

## Executive status

| Area | Status | Evidence |
|---|---|---|
| Supabase project health | VERIFIED | Project reports ACTIVE_HEALTHY |
| Live migration ledger | VERIFIED | 19 migration records returned |
| Workflow schema | VERIFIED | Live columns inspected for workflows, runs, step runs, steps, and logs |
| Claim RPC contracts | VERIFIED | Public/private claim RPCs and worker-secret verifier exist |
| Core RLS policies | VERIFIED | Owner-scoped policies inspected for workflows, runs, logs, profiles, and projects |
| Edge Function source parity | BLOCKED | Candidate source differs from deployed source; deploy parity not established |
| Frontend Supabase integration | BLOCKED | Current React entry point renders demo-only UI; no Supabase client module or auth provider exists |
| Production release | NOT AUTHORIZED | No live deployment, migration, secret update, or Vercel setting change performed |

## Live migration ledger

The live database returned these 19 versions:

- 20261025182821 — simula_app_factory_core_schema_rls
- 20261025183121 — simula_fk_indexes_and_integrity_review
- 20261025183834 — remove_seven_unused_nonconstraint_indexes
- 20261025183942 — add_foreign_key_supporting_indexes
- 20261025201001 — simula_workflow_cron_scheduler
- 20261025201032 — simula_workflow_scheduler_safe_interval_validation
- 20261025201831 — simula_secure_workflow_run_claiming
- 20261025201906 — simula_move_claim_definer_to_private_schema
- 20261025201915 — simula_allow_authenticated_claim_wrapper_access
- 20261025202536 — simula_worker_foundation_indexes_and_pg_net
- 20261025202606 — simula_internal_worker_queue_claiming
- 20261025202644 — simula_pg_net_extension_schema_hardening
- 20261025202741 — simula_secure_cron_worker_auth_and_vault
- 20261025202809 — simula_schedule_secure_cron_worker
- 20261025202850 — simula_worker_stale_run_recovery
- 20261025204429 — restrict_workflow_table_client_privileges
- 20261025204844 — harden_workflow_run_inserts_and_profile_updates
- 20261103134251 — ashaa_backend_api_keys_and_webhook_idempotency
- 20261103134302 — ashaa_backend_credit_ledger

This is a live migration ledger, not proof that all matching SQL migration files are present in the Git repository. Do not recreate or replay these migrations from names alone.

## Verified RPC contracts

The following routines exist in the live database:

| Schema | Function | Arguments | Security definer |
|---|---|---|---|
| private | simula_claim_workflow_runs | p_limit integer | yes |
| private | simula_claim_workflow_runs_internal | p_limit integer | yes |
| private | simula_enqueue_due_workflows | none | yes |
| public | simula_claim_workflow_runs | p_limit integer | no |
| public | simula_claim_workflow_runs_internal | p_limit integer | no |
| public | simula_verify_worker_secret | p_secret text | yes |

The worker candidate calls the public authenticated claim wrapper and the internal worker claim wrapper. The cron candidate calls the internal claim and worker-secret verification routines. Function existence and argument signatures were verified; behavior under concurrency and production scheduling still requires integration tests.

## Verified live table contracts

The inspected live schema includes:

- `workflows`: owner_id, status, trigger_type, trigger_config, settings, next_run_at
- `workflow_steps`: workflow_id, step_order, action_type, config, retry_limit, timeout_seconds
- `workflow_runs`: workflow_id, owner_id, status, input, output, attempt, scheduled_for
- `workflow_step_runs`: run_id, step_id, owner_id, status, input, output, attempt
- `workflow_logs`: owner_id, workflow_id, run_id, level, event, details
- `platform_api_keys`: owner_id, key_prefix, key_hash, scopes, expiry and revocation metadata

The run and step-run tables both have an integer `attempt` column. This supports the candidate's attempt-generation model at the column-contract level. It does not prove every conditional update or failure path is correct; those still need runtime regression tests against an isolated test database.

## RLS and grants

Read-only policy inspection found owner-scoped policies for:

- profiles (select/update own profile)
- user_projects (select/insert/update/delete own project)
- workflows (manage own workflows)
- workflow_steps (manage steps only through an owned workflow)
- workflow_runs (insert/view own runs)
- workflow_step_runs (view own step runs)
- workflow_logs (view own logs)

The `billing_webhook_events` table has RLS enabled and no policies. The inspected table grants were limited to `service_role`; no `anon` or `authenticated` grants were returned. Keep the Advisor finding documented, and re-check grants, policies, views, functions, and future grants before any billing feature release. Do not add a broad policy to silence the warning.

## Frontend integration gap

The current candidate frontend is intentionally a demo. The app entry point does not initialize a Supabase client, authenticate users, load their profile, or fetch live workflows. No `src/lib/supabase.ts` module exists in this candidate.

Do not expose service-role credentials in browser code. A future frontend integration should use the official `@supabase/supabase-js` SDK with only the project URL and publishable/anon key in Vite public environment variables. Server-only credentials remain exclusively in Edge Function secrets.

Recommended staged implementation:

1. Add the official Supabase JS dependency and regenerate `package-lock.json` using npm (do not hand-edit lockfile metadata).
2. Add validated environment configuration and a typed client factory; fail closed when public configuration is missing.
3. Add an AuthProvider with session restoration, auth-state subscription, cleanup, and explicit sign-in/sign-up/sign-out UI.
4. Gate authenticated routes and ensure UI state resets on sign-out/account change.
5. Add owner-scoped data services for profiles, workflows, workflow runs, and logs; rely on RLS as the enforcement boundary.
6. Add loading, empty, error, retry, and offline states. Never render sample metrics as live data.
7. Add browser tests for session restoration, auth expiry, tenant isolation, and forbidden operations.

## Edge Function rollout gate

PR #50 contains candidate source for:

- `simula-workflow-worker`
- `simula-workflow-cron-worker`
- `ashaa-api-key-manager`

Before deployment, compare each candidate with the currently deployed function source and settings. Validate `INFINITEX_ALLOWED_ORIGINS`, JWT verification mode, required secrets, cron schedule, function version, and service-role handling. Do not change production secrets or deploy functions as part of this source-only PR.

## Vercel release gate

Two Vercel projects were previously found linked to the repository, with different framework settings. The intended canonical project/domain must be explicitly identified. The current deployment blocker points to the verified-commit Git setting; it is not evidence of a Vite compilation failure. Do not disable verified-commit protection as a workaround. Resolve the repository integration and deployment authorization path first.

## Release checklist

- [ ] Canonical Vercel project and production domain confirmed
- [ ] GitHub/Vercel verified-commit restriction resolved safely
- [ ] Exact PR #50 head CI green after all final commits
- [ ] Frontend Supabase SDK/auth integration implemented and tested
- [ ] Owner-scoped RLS and negative cross-tenant tests pass
- [ ] Candidate Edge Function source reviewed against live deployed source
- [ ] CORS allowlist and JWT verification settings confirmed
- [ ] Workflow concurrency, retry, stale-attempt, and timeout tests pass against isolated PostgreSQL
- [ ] Migration files reconciled; no migration replay based only on names
- [ ] Browser, keyboard, responsive Android, and accessibility QA complete
- [ ] Error monitoring, backup, rollback, and incident runbooks prepared
- [ ] Human approval recorded for production migration, secret/config changes, merge, and deployment

**No production database or Vercel configuration was changed during this review.**
