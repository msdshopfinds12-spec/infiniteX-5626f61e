# Phase 52 — Live Database Contract Verification

**Inspection date:** 2026-11-20  
**Project:** Ashaa-INX (vepacoemkhudamfaccah)  
**Inspection mode:** READ ONLY — no SQL writes, migrations, grants, RLS changes, secret changes, or deployments  
**Purpose:** Replace schema assumptions with verified live facts before implementing atomic enqueue/idempotency.

## 1. Live project facts

- Supabase project status: ACTIVE_HEALTHY.
- PostgreSQL engine/version: 17 / 17.11.0.003.
- Existing workflow tables: workflows, workflow_steps, workflow_runs, workflow_step_runs, workflow_logs.
- RLS is enabled on all five workflow tables.
- Existing workflow data row counts returned as zero at inspection time; this is a point-in-time observation, not a guarantee about future data.

## 2. Verified ownership and access model

| Table | Authenticated table privileges | RLS policy observed |
|---|---|---|
| workflows | SELECT, INSERT, UPDATE, DELETE | Owner manages own workflow |
| workflow_steps | SELECT, INSERT, UPDATE, DELETE | Owner manages steps through owned workflow |
| workflow_runs | SELECT, INSERT | Owner SELECT; INSERT requires owner_id = auth.uid() and an owned workflow |
| workflow_step_runs | SELECT | Owner SELECT |
| workflow_logs | SELECT | Owner SELECT |

The service role has the expected privileged table access used by the existing workers. Authenticated users do not have UPDATE or DELETE table privileges on workflow_runs.

### Existing insert guard

The live private.enforce_workflow_run_insert_defaults() trigger runs before insert. For an authenticated caller it:

- rejects owner_id that differs from auth.uid();
- rejects a workflow not owned by the authenticated caller;
- forces initial status to queued;
- resets attempt, output, error, started_at, and finished_at to safe initial values.

This is a useful defense-in-depth control, but it does not implement idempotency.

## 3. Verified worker RPC boundary

- public.simula_claim_workflow_runs(integer) is an invoker wrapper with EXECUTE granted to authenticated and service_role.
- Its private SECURITY DEFINER implementation requires auth.uid() and claims only the caller's own queued runs, with a bounded batch.
- public.simula_claim_workflow_runs_internal(integer) has EXECUTE granted to service_role (and postgres), not authenticated.
- The private internal claim function is SECURITY DEFINER and is used by the trusted cron worker.
- The live simula-workflow-worker Edge Function is ACTIVE with platform JWT verification enabled.
- The live simula-workflow-cron-worker Edge Function is ACTIVE with platform JWT verification disabled and validates its internal worker secret before using the service role.

Do not merge these two execution paths or expose the cron worker to browsers.

## 4. Idempotency gap confirmed

The live workflow_runs table currently has no idempotency_key or request_hash column.

Existing uniqueness includes:

- primary key on id;
- unique (workflow_id, scheduled_for) for scheduled workflow runs.

Do not overload scheduled_for for client request deduplication. Scheduled execution identity and API request identity are different concepts.

## 5. Recommended database implementation (proposal only)

No migration is included or applied in this inspection. Before writing the migration, audit every repository callsite and confirm that no supported client depends on direct authenticated inserts.

Recommended additive design:

1. Add nullable idempotency_key and request_hash fields to workflow_runs. Keep both nullable for existing scheduler-created runs.
2. Add strict CHECK constraints for key length/character set and a lowercase SHA-256 hex request fingerprint.
3. Add a partial unique index on (owner_id, idempotency_key) WHERE idempotency_key IS NOT NULL.
4. Add a narrow server-only enqueue RPC. Prefer SECURITY INVOKER, fully qualified object names, and SET search_path = ''; grant EXECUTE only to service_role after explicitly revoking default PUBLIC/anon/authenticated execution. Do not add SECURITY DEFINER unless a documented privilege requirement proves it necessary.
5. The RPC must verify workflow ownership and active status using the server-derived owner ID; insert with the unique key; on conflict, return the existing run only when the stored request fingerprint matches; return a conflict for a reused key with a different fingerprint.
6. The Edge Function computes a canonical JSON fingerprint (stable object-key ordering, array order preserved, SHA-256) and calls the RPC with the verified owner ID. Never accept owner_id or fingerprint from the browser.
7. After callsite and rollout review, revoke direct authenticated INSERT on workflow_runs so enqueue is API-only. Keep the database owner/insert trigger as defense in depth. This permission change must be part of a reviewed migration, not an ad hoc dashboard edit.
8. Preserve the scheduler's nullable idempotency fields and existing (workflow_id, scheduled_for) uniqueness.

### Why this is the preferred alternative

- The unique index is the concurrency authority; application-level "check then insert" is not sufficient.
- The database transaction resolves concurrent duplicate requests atomically.
- The service-role-only RPC prevents browser callers from bypassing API rate/validation policy.
- A request fingerprint distinguishes safe replay from accidental key reuse with a different payload.
- Existing scheduled-run uniqueness remains semantically intact.

## 6. API code status in PR #65

- Enqueue DTO validation and JWT verification: implemented in the feature branch; enqueue deliberately remains fail-closed until the idempotency migration/RPC exists.
- Status read: uses the authenticated user client and the existing owner SELECT RLS policy; no service-role read.
- Cancellation: server verifies JWT, derives owner ID, then atomically updates only id + owner_id + status='queued' to cancelled using the service role. Running actions are not force-stopped; a race with worker claim resolves through the database row update predicate.
- These are code changes only in an unmerged Draft PR. They are not deployed and have not been runtime-tested against the project.

## 7. Required verification before enqueue can be enabled

- Inspect all repository callsites for direct workflow_runs inserts.
- Create the migration using the Supabase CLI's migration generator in a controlled local workspace.
- Apply only to a disposable local/test database first.
- Test two synthetic users: owner A cannot enqueue/read/cancel owner B's runs.
- Run concurrent duplicate enqueue requests: exactly one run is created.
- Same key + same fingerprint returns the original run; same key + different fingerprint returns conflict.
- Non-owned, inactive, missing, and archived workflows are rejected.
- Scheduler-created runs with NULL idempotency values still work.
- Verify grants, RLS, function ACL, constraints, query plans, and Supabase Security Advisor.
- Only after tests and human approval may a production migration be considered.

## 8. Explicit non-actions

This verification did not execute DDL/DML, change table grants, policies, function ACLs, Edge Function secrets, deploy functions, merge PRs, or modify production data.
