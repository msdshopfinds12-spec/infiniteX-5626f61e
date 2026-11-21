# Phase 103.5 — Legacy Workflow RPC Access Inventory

**Status:** READ-ONLY SOURCE REVIEW — NOT A LIVE DATABASE AUDIT  
**Branch:** `phase-103-4-lease-concurrency-hardening`  
**Review date:** 2026-11-21  
**Production changes:** None

## Executive finding

The reviewed migration history creates a legacy owner-scoped claim RPC that is executable by the `authenticated` role:

- `public.simula_claim_workflow_runs(integer)`
- `private.simula_claim_workflow_runs(integer)`

The public wrapper is `SECURITY INVOKER`; it delegates to a private `SECURITY DEFINER` function. The private function obtains `auth.uid()`, selects only that owner's queued runs, changes them to `running`, and increments `attempt`. It does not create or return a lease token or lease expiry.

The later Phase 103.1/103.2 design introduces a service-role-only lease claim facade and service-role-only lease-fenced transition RPCs. The two mechanisms therefore have materially different concurrency/fencing guarantees.

**Risk to verify:** if the historical authenticated grants remain effective in the deployed database, a signed-in user can still invoke the legacy owner-scoped claim path and transition their queued runs to `running` without acquiring a Phase 103 lease token. This may bypass the new worker lease lifecycle. This is a source-history finding, not proof of a current production exposure.

## Evidence from reviewed migration source

| Migration | Source behavior | Security implication |
|---|---|---|
| `20261025201831_simula_secure_workflow_run_claiming.sql` | Creates public `simula_claim_workflow_runs(integer)`; checks `auth.uid()`; grants EXECUTE to `authenticated`. | Authenticated callers can invoke the owner-scoped legacy claim RPC. |
| `20261025201906_simula_move_claim_definer_to_private_schema.sql` | Moves SECURITY DEFINER implementation to `private.simula_claim_workflow_runs(integer)`; public invoker wrapper delegates to it; grants EXECUTE to `authenticated`. | Private function remains reachable through wrapper. |
| `20261025201915_simula_allow_authenticated_claim_wrapper_access.sql` | Grants `USAGE` on schema `private` and EXECUTE on the private legacy function to `authenticated`. | Direct private RPC access may also be possible where PostgREST exposes the schema; confirm exposed schemas and final grants. |
| `20261025202606_simula_internal_worker_queue_claiming.sql` | Adds a separate cross-owner internal claim function; revokes authenticated access to that new function. | Does not, by itself, revoke the older owner-scoped legacy function. |
| `20261025202741_simula_secure_cron_worker_auth_and_vault.sql` | Restricts the newer public internal cron facade and worker-secret verification to `service_role`. | Good boundary for the newer cron path; not evidence that the older owner-scoped function was revoked. |
| `20261025202850_simula_worker_stale_run_recovery.sql` | Replaces the private cross-owner worker claim and keeps it service-role-only. | Does not, by itself, remove the legacy owner-scoped RPC. |
| `phase-103-1-owner-scoped-workflow-lease-claim.sql` | Creates a new lease claim implementation and a public three-argument facade; grants facade EXECUTE only to `service_role`. | New claim contract is service-role-only and lease-aware. |
| `phase-103-2-lease-fenced-step-transitions.sql` | Creates lease-fenced step transitions; revokes PUBLIC/anon/authenticated and grants EXECUTE to `service_role`. | New transition path is service-role-only. |

## Legacy versus lease-aware behavior

### Legacy owner-scoped claim

- Authenticates with `auth.uid()`.
- Filters queued runs by `owner_id`.
- Uses row locking with `FOR UPDATE SKIP LOCKED`.
- Sets `status = 'running'` and increments `attempt`.
- Does not issue a lease token or lease expiry.
- Does not bind subsequent step/run mutations to a lease generation.

### Phase 103 lease-aware path

- Claim is routed through the service-role-only lease facade.
- Claim returns `lease_token` and `lease_until`.
- Subsequent heartbeat, step start/failure/completion, and run finish calls validate lease identity/generation.
- Current reviewed Edge Function adapters use `claimWorkflowLeases` for authenticated worker requests and `claimCronWorkflowLeases` for trusted cron requests.

## Read-only catalog verification required

Run this query only against an approved disposable rehearsal database first. It reads PostgreSQL catalogs and does not mutate data or privileges.

```sql
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  p.prosecdef AS security_definer,
  pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
  pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
WHERE (n.nspname, p.proname) IN (
  ('public', 'simula_claim_workflow_runs'),
  ('private', 'simula_claim_workflow_runs'),
  ('private', 'simula_claim_workflow_runs_internal'),
  ('public', 'simula_claim_workflow_runs_internal'),
  ('private', 'simula_claim_workflow_runs_lease_internal'),
  ('public', 'simula_claim_workflow_runs_lease_internal'),
  ('public', 'simula_start_workflow_step_with_lease'),
  ('public', 'simula_fail_workflow_step_with_lease'),
  ('public', 'simula_complete_step_with_outbox_lease')
)
ORDER BY n.nspname, p.proname, identity_arguments;

SELECT
  n.nspname AS schema_name,
  r.rolname AS role_name,
  has_schema_privilege(r.rolname, n.oid, 'USAGE') AS can_use_schema
FROM pg_catalog.pg_namespace AS n
CROSS JOIN pg_catalog.pg_roles AS r
WHERE n.nspname = 'private'
  AND r.rolname IN ('anon', 'authenticated', 'service_role')
ORDER BY r.rolname;
```

Also inspect PostgREST's configured exposed schemas. A private-schema EXECUTE grant is not by itself proof that PostgREST exposes that schema.

## Recommended remediation options — NOT APPLIED

1. **Preferred if no supported client depends on it:** revoke EXECUTE from `authenticated` on both legacy signatures and remove private-schema USAGE from `authenticated` if no other legitimate private RPC requires it. Consider dropping the legacy public wrapper only after call-site inventory and compatibility review.
2. **Compatibility-preserving alternative:** retain a public API wrapper but make it delegate to a safe, lease-aware server-side workflow that does not expose a raw claim mutation to browser clients. This requires a designed API contract; do not simply grant clients access to the service-role lease facade.
3. **Temporary containment:** retain the legacy function but add explicit telemetry and a deprecation window while identifying all clients. This does not eliminate the lease-bypass risk.

Before any remediation:
- Search all frontend, mobile, edge-function, SQL, and scheduled callers for both legacy function names.
- Verify final grants and PostgREST exposed schemas in the disposable rehearsal database.
- Run compatibility tests and worker regression suites.
- Prepare a reversible migration and explicit approval gate.
- Do not apply revokes, drops, grants, migrations, or production changes as part of this inventory.

## Verification ledger

- [x] Reviewed the named historical claim migrations.
- [x] Reviewed Phase 103.1 and 103.2 grant statements.
- [x] Reviewed current worker adapter call sites in both Edge Functions.
- [ ] Exhaustive repository-wide caller inventory.
- [ ] Disposable database catalog verification.
- [ ] PostgREST exposed-schema verification.
- [ ] Compatibility test and remediation plan approval.
- [ ] Production privilege state verification.

**Conclusion:** do not mark the legacy RPC as removed or the database as fully hardened yet. The next safe step is catalog verification in the disposable database plus a complete caller inventory. No grants or production state were changed.
