# InfiniteX Supabase Runtime and Schema Verification

**Date:** 2026-11-21  
**Target:** Ashaa-INX / `vepacoemkhudamfaccah`  
**Git candidate:** `engineering/infinitex-canonical-integration-candidate`  
**Review mode:** read-only; no database or runtime mutations  
**Status:** PARTIAL — actual schema, function privileges, deployed Edge Function inventory, cron schedule, advisors, and generated type names inspected

## 1. Executive summary

The actual Supabase project is reachable and `ACTIVE_HEALTHY` on PostgreSQL 17. The workflow schema contains the critical unique constraint `workflow_step_runs(run_id, step_id)`, and workflow RLS policies are present. The deployed worker functions are active and the cron job is active.

**Critical integration finding:** the currently deployed Edge Function implementations are materially different from the candidate-branch source. The deployed worker source predates candidate hardening. Do not deploy or merge based only on GitHub CI; first reconcile the deployed/runtime version with the candidate source and verify the changes in an isolated environment.

## 2. Verified project state

- Project: `Ashaa-INX`
- Project ref: `vepacoemkhudamfaccah`
- Region: `ap-northeast-2`
- Database: PostgreSQL 17
- Status: `ACTIVE_HEALTHY`
- Migration history returned 19 applied migration versions, including workflow queue claiming, private-schema definer hardening, worker secret verification, cron scheduling, stale-run recovery, and API-key/webhook/credit-ledger foundations.

## 3. Workflow database contract — verified

### Constraints and indexes

- `workflow_step_runs` has `UNIQUE (run_id, step_id)`.
- `workflow_steps` has `UNIQUE (workflow_id, step_order)`.
- `workflow_runs` has primary key `id`, owner foreign key, workflow foreign key, status check, and nonnegative attempt check.
- `workflow_runs_queue_idx` is a partial index for queued runs.
- `workflow_step_runs_run_idx`, `workflow_step_runs_step_id_idx`, and `workflow_step_runs_owner_id_idx` exist.
- Workflow schedule and owner indexes exist.
- Workflow logs have owner, run, and workflow indexes.

The uniqueness contract previously marked as pending in the static source review is now verified against actual database metadata.

### RLS policies

The following workflow tables have RLS enabled:
- `workflows`
- `workflow_steps`
- `workflow_runs`
- `workflow_step_runs`
- `workflow_logs`

Observed policies are owner-scoped. Workflow-step management checks ownership through the parent workflow. Workflow run insertion checks both the authenticated owner and parent workflow ownership. Workflow run, step-run, and log reads are owner-scoped.

### RPCs and grants

Verified functions:
- `private.simula_claim_workflow_runs(integer)` — SECURITY DEFINER, empty search_path, requires `auth.uid()`, clamps batch limit to 1..5, uses `FOR UPDATE SKIP LOCKED`, atomically changes queued runs to running and increments attempt.
- `private.simula_claim_workflow_runs_internal(integer)` — SECURITY DEFINER, empty search_path, service-role-only execution; recovers stale running leases after 15 minutes, fails runs at attempt >= 5, requeues runs below that threshold, then claims queued rows using `FOR UPDATE SKIP LOCKED`.
- `public.simula_claim_workflow_runs(integer)` — invoker wrapper, authenticated/service_role execute only.
- `public.simula_claim_workflow_runs_internal(integer)` — invoker wrapper, service_role execute only.
- `public.simula_verify_worker_secret(text)` — SECURITY DEFINER, empty search_path, service_role-only execution; checks the secret against the Vault decrypted secret named `simula_worker_secret`.

No anon execution privilege was found for these RPCs. Internal claim and secret-verification RPCs are not executable by authenticated users.

## 4. Live runtime and scheduler — verified

- `simula-workflow-worker`: ACTIVE, JWT verification enabled.
- `simula-workflow-cron-worker`: ACTIVE, JWT verification disabled because it performs its own worker-secret validation.
- `ashaa-api-key-manager`: ACTIVE, JWT verification enabled.
- A `pg_cron` job is active every minute (`* * * * *`) and calls `/functions/v1/simula-workflow-cron-worker` with the project URL and worker secret loaded from Vault.

The schedule and function presence are verified. This does not prove successful execution, successful workflow outcomes, or correct alerting/monitoring.

## 5. Critical deployed-versus-candidate drift

The active deployed worker source and the candidate branch source are not equivalent.

### Candidate branch has hardening absent from deployed source

The candidate source includes:
- request-body streaming/byte-limit helper;
- explicit origin allowlist for the authenticated worker;
- strict claimed-run and workflow-owner validation;
- workflow-run attempt-generation compare-and-set on terminal updates;
- step-run attempt-generation compare-and-set on start and terminal updates;
- superseded-run handling;
- bounded action input/output budget checks.

The deployed worker version returned by Supabase does not include these same controls. In particular, the deployed worker updates workflow run state using id/owner/status filters without checking the claimed `attempt` generation, and its step-run transitions do not apply the candidate's generation CAS. The deployed cron worker checks Content-Length rather than using the candidate's streaming body reader.

**Risk:** an older worker can potentially finish after a lease is reclaimed and overwrite newer state if no attempt-generation predicate fences its updates. This is a race-condition risk inferred from the deployed source and the verified lease-reclaim behavior; it has not been reproduced against live data.

### Retry behavior differs

- The current candidate branch implements a shared `executeWithRetry` helper in both workers. It validates `retry_limit` from 0 through 10, retries only allowlisted transient error codes, applies capped exponential full jitter, and enforces an aggregate step timeout. The current deterministic local action set does not emit retryable errors. This is candidate-source behavior only; the deployed Edge Functions remain on the older implementation until an approved rollout.
- The deployed functions contain a retry loop based on `retry_limit`, but they retry every caught action error, including deterministic validation/configuration failures. That is not a robust transient-error retry policy.

**Required reconciliation:** retain candidate generation fencing and request hardening; verify the bounded retry contract against the database limit and add idempotency/integration tests before enabling retries for external side effects. Do not copy the older deployed retry loop blindly.

## 6. Generated TypeScript schema parity

Supabase-generated TypeScript types and the candidate repository snapshot contain the same public table names (14) and function names (3):
- Tables: `billing_webhook_events`, `credit_ledger`, `payments`, `platform_api_keys`, `profiles`, `subscriptions`, `tools`, `usage_logs`, `user_projects`, `workflow_logs`, `workflow_runs`, `workflow_step_runs`, `workflow_steps`, `workflows`.
- Functions: `simula_claim_workflow_runs`, `simula_claim_workflow_runs_internal`, `simula_verify_worker_secret`.

This is a name-level parity check, not a full structural diff of every column, nullability, relationship, enum, and function signature. A full generated-file comparison remains required before treating the checked-in types as fully current.

## 7. Advisor findings

### Security advisor

One INFO finding:
- `public.billing_webhook_events` has RLS enabled and no policies.

Read-only grants show only `postgres` and `service_role` have table privileges; no anon/authenticated grants were returned. This appears consistent with a service-role-only internal webhook idempotency table. Keep it that way unless a documented user-facing access requirement emerges. Do not add permissive policies just to silence the informational advisor.

### Performance advisor

Six INFO unused-index findings were returned:
- `user_projects_tool_id_fkey_idx`
- `usage_logs_tool_id_fkey_idx`
- `payments_subscription_id_fkey_idx`
- `platform_api_keys_owner_created_idx`
- `billing_webhook_events_status_received_idx`
- `credit_ledger_owner_created_idx`

Do not drop these indexes solely from the advisor result. Confirm workload, query plans, write overhead, and retention/reporting access patterns first. Low traffic or a recently created index can appear unused.

## 8. Critical next engineering actions

1. **Runtime drift gate:** compare all deployed Edge Function files with the candidate source and record an explicit release diff.
2. **Worker concurrency tests:** candidate now has strict-generation prechecks, database CAS predicates, and deterministic Node/Deno model tests. Reproduce lease expiry/reclaim and stale completion against an isolated PostgreSQL/Supabase runtime before release.
3. **Retry contract:** candidate retry semantics are implemented and covered by Node/Deno tests. Still add adapter idempotency and integration tests before external side-effect actions are enabled.
4. **Cron observability:** inspect recent Edge Function/Postgres logs for invocation failures, HTTP outcomes, claim counts, and worker-secret verification failures. Avoid logging secrets or tokens.
5. **Type parity:** perform a full generated TypeScript diff, including table columns, relationships, and RPC Args/Returns.
6. **Billing webhook isolation:** preserve service-role-only access; review webhook signature verification and idempotency behavior separately.
7. **End-to-end verification:** test two-user isolation, duplicate webhook delivery, concurrent worker claims, stale worker completion, malformed requests, and retry behavior in an isolated test environment.
8. **Release:** only after review, exact-head CI, runtime parity, and human approval.

## 9. Explicit non-actions

No SQL writes, migrations, function deployments, cron changes, secret reads/changes, billing changes, production data writes, merges, or releases were performed. Vault secret values were not retrieved. This report does not claim successful live workflow execution.


## 10. Phase 67 — read-only concurrency contract verification (2026-11-21)

A fresh read-only catalog inspection reconfirmed the exact definitions of both private claim functions, public wrappers, and worker-secret verifier.

- Authenticated claim uses `auth.uid()`, clamps the batch to 1..5, selects the caller's queued runs with `FOR UPDATE SKIP LOCKED`, then atomically sets running state and increments attempt.
- Internal claim marks leases older than 15 minutes as failed at attempt >= 5, requeues those below 5, and then claims queued rows using `FOR UPDATE SKIP LOCKED` with an atomic attempt increment.
- `workflow_step_runs` has the unique constraint `UNIQUE (run_id, step_id)`.
- The public internal-claim wrapper and worker-secret verifier grants are restricted to postgres/service_role in the inspected routine privilege results; no anon/authenticated execute grants were returned.
- The private authenticated claim function grant includes authenticated, postgres, and service_role; no anon execute grant was returned.
- All claim and verifier SECURITY DEFINER definitions use an empty search_path and fully qualified object references.

**Important limitation:** this is catalog-definition verification, not a live two-session concurrency test. No rows were inserted or changed.

### GitHub reproducibility blocker

The candidate branch has no `supabase/config.toml` and no `supabase/migrations/` directory, while the connected database reports 19 applied migrations. Consequently, the repository cannot currently recreate the live workflow schema from a clean local stack. A faithful pgTAP or concurrent integration suite must wait until the exact migration source is recovered and committed. Do not replace missing migrations with a guessed schema.

See [Phase 67 — Database Concurrency Verification](PHASE-67-DATABASE-CONCURRENCY-VERIFICATION.md) for the RPC definitions, verified constraints, test acceptance criteria, and safety boundary.


## 10. Phase 68 — migration restoration and isolated concurrency evidence

The candidate branch now includes the 19 ledger-recovered SQL statements, their SHA-256 manifest, applied-versus-candidate classification, noncanonical disposable baseline fixture, replay harness, and a candidate-specific PostgreSQL 17 CI workflow.

Exact candidate implementation commit `37863d751532e8293a0a4f69c9fb16d1a7b7c278` passed:
- [Push candidate quality gates](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44795384077)
- [PR candidate quality gates](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44795393670)
- [Push PostgreSQL replay/concurrency/security](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44795384056)
- [PR PostgreSQL replay/concurrency/security](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44795393676)

The disposable PostgreSQL job executes the 19 recovered statements and separately classified candidate migration in a Supabase PostgreSQL 17 container. It then runs a real multi-session row-lock contention test for `FOR UPDATE SKIP LOCKED`, verifies distinct claim generations, exercises stale lease recovery below attempt 5 and terminal failure at attempt 5, checks step-run uniqueness and stale-generation update rejection, runs the separate security behavior suite, and removes the container.

**Scope precision:** the row-lock harness is real PostgreSQL session testing, not a high-volume claim stress test. It does not prove the deployed Edge Functions have been updated or that a live workflow completes end to end. No production SQL writes, migration, function deployment, secret change, cron change, merge, or release occurred.

The exact candidate CI pass is code evidence for the candidate branch. It is not a substitute for full live catalog parity, deployed source reconciliation, operational monitoring, and a separately approved rollout.


## 11. Phase 69 correction — parallel stress evidence

The earlier statement that high-volume concurrency was untested is superseded for the bounded CI scenario. On candidate head `aaf9bb1d3f16904ec07d5e32b1c495ec8010dd3a`, 16 concurrent PostgreSQL sessions claimed 80 synthetic runs exactly once; all attempt generations were 1 and no queued fixtures remained. Two concurrent inserts for one `(run_id, step_id)` identity produced exactly one row.

[PR Phase 69 PostgreSQL replay/stress/security — SUCCESS](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44796503703)

The older sections describing the initial missing migration source are historical observations and are superseded by Phase 68 recovery. The older statement that there is no candidate migration directory is no longer current. The live catalog parity and deployed worker parity gaps remain open.
