# Phase 50.2 — Live Schema and Authorization Findings

Inspection date: 2026-11-20. Environment: connected Supabase Ashaa-INX. Scope: read-only schema, migrations, RLS, column grants, triggers, Edge Function inventory, and advisors.

## Executive decision
Keep authorization fail-closed. Do not grant capabilities from `profiles.role` yet. The schema has a role field constrained to `user` or `admin`, but no approved administrator bootstrap/change process, membership model, role-change audit trail, or role-to-capability mapping was established.

## Live schema inventory
Fourteen public tables were reported, all with RLS enabled: profiles, tools, user_projects, usage_logs, subscriptions, payments, workflows, workflow_steps, workflow_runs, workflow_step_runs, workflow_logs, platform_api_keys, billing_webhook_events, credit_ledger. No organizations, teams, memberships, workspaces, or permissions relation appeared in the public schema inventory.

### Profiles
- profiles.id references auth.users.id.
- profiles.role is constrained to user/admin.
- authenticated can SELECT role; authenticated column UPDATE grants do not include role.
- profiles_select_own and profiles_update_own scope to auth.uid() = id.
- inspected trigger inventory showed only profiles_set_updated_at; no role-specific trigger/audit trigger.
- This is not evidence of multi-tenant membership or a complete RBAC model. The trusted admin assignment path remains unverified.

## Confirmed privilege risks

### P1: platform_api_keys.key_hash is SELECTable by authenticated
The live column-grant query confirms authenticated SELECT on public.platform_api_keys.key_hash. The owner-scoped RLS policy limits exposure to the owner's own rows, and the inspected API-key manager omits the hash from its response, but direct table access still exposes a sensitive verifier unnecessarily.

Remediation design: revoke client SELECT on key_hash; expose only approved metadata columns; keep hash verification server-side. Review frontend consumers before preparing a migration.

### P1: workflow_runs exposes lifecycle columns to client INSERT, with a protective trigger
Authenticated INSERT grants include status, attempt, started_at, finished_at, output, error_message, scheduled_for, owner_id, workflow_id and input. The inspected trigger body `private.enforce_workflow_run_insert_defaults()` verifies `auth.uid()` against owner and workflow, then overwrites status to queued, attempt to zero, and output/error/start/finish fields to null for authenticated requests. This is a meaningful protection. However, broad client INSERT grants remain unnecessary exposure and the trigger does not overwrite every worker-related field (for example scheduled_for).

Remediation design: browser sends a minimal enqueue request; trusted server derives owner and lifecycle fields; worker owns transitions and results. Keep the trigger as defense in depth, but narrow client INSERT privileges to the minimal required columns after verifying all current client insert paths. Add tests proving forged lifecycle values are overwritten.

### INFO: billing_webhook_events has RLS but no policies
Security Advisor reports one INFO finding. This may be intentional for a server-only table. Verify browser roles have no grants and webhook processing uses a trusted server path. Do not add a broad policy merely to clear the notice.

## RLS observations
- profiles SELECT/UPDATE are own-row scoped.
- platform_api_keys SELECT and revoke UPDATE are owner scoped, but hash SELECT remains unsafe.
- workflows has owner-scoped ALL policy.
- workflow_runs has owner-scoped SELECT and owner/workflow-scoped INSERT.
RLS controls rows; SQL privileges control which operations and columns are available.

## Edge Function source review

- `ashaa-api-key-manager` verifies the caller with Auth `getUser(token)`, derives `owner_id` from the verified user, uses a server-side service-role client for writes, and its list projection omits `key_hash`. It returns the raw API key once and stores only a SHA-256 digest. This is a safer pattern than exposing the hash through direct table reads. Its CORS configuration currently uses wildcard origin; tighten to the deployed app origin allowlist before production hardening.
- `simula-workflow-worker` verifies the caller via `getUser(token)`, derives the owner from the verified user, claims only that user's queued runs, and uses a service-role client for worker-owned transitions. Its CORS configuration currently uses wildcard origin. The inspected code reads workflow steps by workflow ID; the claim RPC's owner-scoped result is the upstream boundary and should remain covered by isolation tests. The declared `timeout_seconds` field is not enforced by the inspected action execution loop; treat timeout enforcement as a functional reliability gap, not proof of a security bypass.
- `simula-workflow-cron-worker` has platform JWT verification disabled, but checks a supplied worker secret via `simula_verify_worker_secret` before accessing the queue with service role. This is an intentional alternate authentication path if the RPC performs strong hash/secret verification and secret rotation is operationally sound. Do not enable or disable JWT verification without reviewing the scheduler invocation and secret lifecycle.

## Edge Function inventory
- simula-workflow-cron-worker: ACTIVE, verify_jwt=false.
- simula-workflow-worker: ACTIVE, verify_jwt=true.
- ashaa-api-key-manager: ACTIVE, verify_jwt=true.
The cron worker's disabled platform JWT verification is not automatically unsafe if it implements strong independent request authentication. Inspect its authentication and secret rotation before changing configuration. No function was deployed or changed.

## Advisor results
Security: one INFO finding, billing_webhook_events RLS enabled without policies. https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

Performance: six INFO unused-index candidates: user_projects_tool_id_fkey_idx, usage_logs_tool_id_fkey_idx, payments_subscription_id_fkey_idx, platform_api_keys_owner_created_idx, billing_webhook_events_status_received_idx, credit_ledger_owner_created_idx. These are not automatic deletion recommendations; assess workload and FK support first. https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index

## Migration history
The live project reports 19 migrations, including workflow ownership/worker hardening, workflow insert/profile update hardening, API-key/webhook foundation, and credit-ledger work. Names were inspected; no migration was applied.

## Next sequence
1. Inspect exact definitions of private.enforce_workflow_run_insert_defaults(), API-key manager, and cron-worker authentication.
2. Establish an approved administrator bootstrap/role-change process. Keep role-derived capabilities disabled until verified.
3. Design safe API-key metadata projection and update frontend consumers.
4. Design minimal workflow enqueue API with server-owned lifecycle.
5. Create migration proposals and adversarial tests in GitHub only; production changes require separate explicit approval.
6. Test Owner A / Owner B isolation with synthetic identities in an isolated environment.
7. Run exact-SHA CI and independent security review before deployment.

## Evidence limits
This review did not inspect every function body, historical migration SQL body, frontend query, or run live adversarial tests. Those remain unverified.

## Safety
Read-only inspection only. No SQL writes, schema changes, grants/revokes, policy changes, migrations, data mutation, function deployment, secret/billing changes, Vercel deployment, merge, or release.
