# Phase 6G.3 — Supabase Backend Read-Only Audit and Persistence Decision

Date: 2026-11-19
Scope: read-only inspection only
Repository: msdshopfinds12-spec/infiniteX-5626f61e
Implementation branch: feat/infiniteX-zero-budget-implementation
Supabase project inspected: Ashaa-INX (ref vepacoemkhudamfaccah)

## Executive decision

Do not create a new Supabase project or paid database branch for this milestone. The inspected Ashaa-INX project is ACTIVE_HEALTHY on PostgreSQL 17.11 and already contains a substantial workflow engine, owner-scoped task-run claiming, a service-only internal queue claim, worker Edge Functions, API-key management, billing webhook intake, and a credit ledger.

However, the inspected schema does not contain the approval-bound AI task contract required by Phase 6G.1/6G.2. Existing workflow_runs is not a drop-in implementation: it has no awaiting_approval state, no task_version, no agent/capability identity/version binding, no payload digest, and no approval-grant persistence. Do not overload the existing workflow queue or silently widen its state machine.

The Supabase project was inspected because it is the user's previously identified Ashaa-INX project. This audit does NOT prove that the current InfiniteX frontend is connected to this Supabase project. The current InfiniteX package manifest does not list @supabase/supabase-js, and no frontend/backend connection was established by this read-only pass.

## Verified platform inventory

- Project status: ACTIVE_HEALTHY.
- PostgreSQL engine: 17.11.
- Region: ap-northeast-2.
- Public tables returned by the table inventory: 14.
- All 14 listed public tables have RLS enabled.
- The table inventory reported zero rows for the listed tables at inspection time; treat this as the tool's reported count, not as a guarantee about all future data.
- Existing migrations include the core Simula schema, workflow scheduling, secure run claiming, internal worker queue claiming, worker secret/Vault setup, API-key/webhook idempotency, and credit ledger.
- Existing Edge Functions: simula-workflow-worker (JWT verification enabled), simula-workflow-cron-worker (JWT verification disabled; code checks a dedicated worker-secret header through a database RPC), and ashaa-api-key-manager (JWT verification enabled).

Relevant existing public tables:
- workflows
- workflow_steps
- workflow_runs
- workflow_step_runs
- workflow_logs
- platform_api_keys
- billing_webhook_events
- credit_ledger

## Existing security controls observed

### Workflow owner isolation

The owner-scoped claim implementation in private.simula_claim_workflow_runs:
- requires auth.uid() to be non-null;
- selects only queued workflow_runs belonging to auth.uid();
- uses FOR UPDATE SKIP LOCKED;
- bounds claim batch size to 1..5;
- atomically changes selected rows to running and increments attempt.

The public wrapper is SECURITY INVOKER with an empty search_path. Catalog privilege checks showed:
- anon cannot execute the user-scoped or internal claim wrappers;
- authenticated can execute the owner-scoped wrapper;
- service_role can execute both;
- authenticated cannot execute the internal claim wrapper.

The internal worker claim function uses bounded claims and a 15-minute stale-run recovery policy, with a maximum-attempt cutoff.

### Edge Function boundaries

- simula-workflow-worker has verify_jwt=true, validates the bearer token with auth.getUser, and invokes the owner-scoped claim RPC using a user-scoped client.
- simula-workflow-cron-worker has verify_jwt=false but requires an x-simula-worker-secret header and calls simula_verify_worker_secret before using the service-role client. This is a shared-secret endpoint, not a public unauthenticated worker.
- ashaa-api-key-manager has verify_jwt=true, validates the bearer token, filters records by the verified owner ID, allowlists API-key scopes, returns the raw key once, and stores only a SHA-256 digest.
- Service-role keys are read from Edge Function environment variables in server-side function code. No service-role key was observed in the InfiniteX frontend package manifest or the reviewed frontend files.

### RLS and grants

- All 14 listed public tables have RLS enabled.
- Owner policies were observed for profiles, user_projects, usage_logs, subscriptions, payments, workflows, workflow_steps, workflow_runs, workflow_step_runs, workflow_logs, platform_api_keys, and credit_ledger.
- billing_webhook_events has RLS enabled and no RLS policies. The inspected table grants were limited to postgres and service_role; no anon/authenticated table grants were present in the inspected grants output. This appears consistent with an internal-only webhook inbox, but must remain internal-only. Do not add client policies simply to silence the linter.
- Security Advisor returned one INFO finding: RLS enabled with no policy on public.billing_webhook_events. The finding is not, by itself, proof of exposure because client roles did not have table grants in the inspected output.
- Performance Advisor returned six INFO unused-index notices. Do not drop these indexes based on a single snapshot; usage can be low on a young or lightly used database and the indexes may support foreign keys or future workloads.

Reference: https://supabase.com/docs/guides/database/postgres/row-level-security

## Confirmed gaps for InfiniteX approval persistence

The existing workflow_runs schema contains:
- id, workflow_id, owner_id, status, input, output, error_message, attempt, started_at, finished_at, created_at, scheduled_for.

It does not contain:
- awaiting_approval lifecycle state;
- monotonic task_version / optimistic concurrency version;
- agent_id and agent_version;
- capability_id and capability_version;
- canonical payload hash;
- approval grant ID/digest/expiry/consumed state;
- idempotency key for approval request;
- execution lease/fencing token.

Therefore the Phase 6G.2 adapter cannot safely point at workflow_runs without a new schema contract and migration. It must not be marked connected or production-ready.

## Worker reliability finding

Both workflow worker implementations declare timeout_seconds on the step shape, but the reviewed action execution path does not enforce that timeout. The internal queue recovery uses a 15-minute stale-running threshold. The current action allowlist is synchronous and deterministic, so this is not evidence of an existing arbitrary-code execution path. It is nevertheless a reliability/fencing gap before adding remote AI providers or long-running tools:

1. enforce a real per-step deadline;
2. persist a lease/fencing token or attempt generation on each claim;
3. require every step/run completion update to match the active claim generation;
4. ensure stale workers cannot complete or overwrite a newer attempt;
5. make side-effecting adapters idempotent and require explicit approval.

Do not expand the current action allowlist to network, shell, file, arbitrary plugin, or model-provider execution until those controls are implemented and tested.

## Recommended architecture

Keep two separate bounded domains:

1. Existing Simula workflow engine: deterministic workflow definitions, scheduled runs, step runs, logs, and existing owner-scoped queue claims.
2. InfiniteX AI task approval domain: explicit task lifecycle, canonical execution snapshot, approval grants, one-time consume, and auditable task events.

Recommended future database layout (proposal only; no DDL applied):

- private.ai_tasks
  - id UUID primary key
  - owner_id UUID references auth.users
  - status constrained to planned / awaiting_approval / approved / running / succeeded / failed / cancelled
  - task_version BIGINT NOT NULL
  - agent_id, agent_version, capability_id, capability_version
  - input JSONB with strict object and size validation
  - payload_hash CHAR(64)
  - idempotency_key TEXT
  - created_at / updated_at / started_at / finished_at

- private.ai_task_events
  - append-only event ID, task_id, owner_id, sequence, from_status, to_status, actor_subject, event_type, metadata, created_at
  - unique(task_id, sequence)
  - no client UPDATE or DELETE

- private.ai_approval_grants
  - grant ID, task_id, owner_id, token_digest, task_version, payload_hash, agent/capability bindings, expires_at, consumed_at, created_at
  - unique(token_digest)
  - never store the raw bearer approval token
  - one-time consumption performed atomically

All three tables should live in a non-exposed schema and be accessed through narrowly scoped trusted server functions or an authenticated Edge Function. Avoid SECURITY DEFINER unless strictly necessary; if used, fix search_path to an empty path, schema-qualify every object, verify auth.uid()/owner scope in the function, revoke EXECUTE from PUBLIC/anon/authenticated by default, and grant only the intended server role. Do not expose service-role credentials to the browser.

The critical transaction must atomically:
1. lock and validate the task by task ID + owner + status + version + payload hash + agent/capability versions;
2. validate an unexpired, unconsumed approval grant with matching bindings;
3. consume the grant;
4. transition task to running and increment task_version;
5. append the running event;
6. return a claim/fencing token.

If any step fails, the transaction must roll back. A unique idempotency key is required for task creation and approval requests. Execution should be dispatched only after the transaction commits.

## Free-first options

Preferred:
- Reuse the existing Ashaa-INX project only if the user confirms it is the intended InfiniteX backend and its current billing/usage remains acceptable.
- Keep database usage inside the existing project; do not create a Supabase branch because previous user constraints exclude hourly branch cost.
- Use deterministic local capabilities and tests while no model provider is configured.

Alternative:
- Keep approval persistence behind a database-neutral interface and use an existing approved free local PostgreSQL instance for development tests, then add a Supabase adapter later.
- Keep the current in-memory demo only for UI tests; never represent it as durable or production authorization.

Not recommended:
- Reuse workflow_runs as approval tasks without a schema extension.
- Add approval fields to existing production workflow tables before compatibility and rollback analysis.
- Create a new Supabase project/branch without explicit cost review.
- Store raw approval tokens or service-role keys in browser storage, Vite environment variables, or Git.

## Next implementation gate

Before any database migration:
1. Confirm Ashaa-INX is the intended InfiniteX backend.
2. Confirm the current project billing/usage remains within the user's ₱0-first constraints.
3. Review current RLS policies, function ACLs, worker-secret verification function, cron schedule and vault secret references.
4. Build a migration proposal in GitHub only; do not apply it.
5. Add database integration tests for two simultaneous claims, replay, stale version, payload mutation, cross-owner access, grant expiry, rollback and stale worker fencing.
6. Obtain explicit approval for the exact migration and target project before applying anything.

## Explicit non-actions

- No database writes, DDL, migration, seed data, policy changes, function deployment, secret reads, key rotation, billing change, branch creation, project creation, or production deployment were performed.
- No production worker was invoked.
- No external AI provider was connected.
- This report is an architecture and security review, not a penetration test or a full audit of every project object.
