# Phase 4N.10 — Workflow Branch Compatibility and Runtime Safety Audit

**Status:** READ-ONLY SOURCE AUDIT COMPLETE; DATABASE / LIVE RUNTIME VERIFICATION BLOCKED  
**Snapshot:** 2026-11-20  
**Base ref:** `feat/phase-4n8c-workflow-reliability-pr35`  
**Base SHA:** `84d7cb2a3d5511ab25a8265e109cf85db4ac63cd`  
**Scope:** GitHub branch ancestry, tracked source, worker behavior, retry policy, and migration provenance  
**Changes made by this phase:** Documentation only. No runtime code, SQL, secrets, database, deployment, or production configuration changed.

## 1. Executive decision

Do not merge the workflow implementation into the frontend foundation or apply the Phase 4N.8B migration yet.

The inspected reliability branch contains meaningful worker security and transactional fencing work, but the database contract is not fully recoverable from tracked migrations. In addition, retry policy exists as a pure decision module but is not wired into either inspected worker. The step timeout helper is explicitly cooperative and cannot interrupt a synchronous action that blocks the isolate.

**Recommended next move:** preserve the current implementation as an isolated backend candidate; recover authoritative schema and every queue/recovery writer; then implement durable per-step attempts and mandatory disposable-database concurrency tests. Keep retry execution disabled until those gates pass.

## 2. Branch topology evidence

GitHub compare results at this snapshot:

| Comparison | Result | Interpretation |
|---|---:|---|
| `feat/phase-4n8c-workflow-reliability` → `feat/phase-4n8c-workflow-reliability-pr35` | 51 commits ahead, 0 behind | The PR35 reliability line contains a substantial additional implementation/documentation stack. |
| `fix/phase-4n8b-transactional-step-fencing` → `fix/phase-4n8b-transactional-step-fencing-impl` | 3 commits ahead, 0 behind | The implementation branch is a small stacked change over its base. |
| `fix/phase-4n8b-transactional-step-fencing-impl` compared with `feat/phase-4n8c-workflow-reliability-pr35` | implementation branch is 14 commits behind | The larger reliability branch has advanced beyond the implementation branch; do not treat these as independent patches to cherry-pick blindly. |
| `feat/phase-4n7-workflow-reliability` compared with `feat/phase-4n8c-workflow-reliability` | 23 commits behind | Phase 4N.8 line is newer in this ancestry comparison. |

The comparison results describe Git ancestry, not feature correctness. They do not prove all other branches are compatible or that all PRs should be merged.

## 3. Runtime source findings

### 3.1 Retry policy is not integrated

Evidence:
- Both `simula-workflow-worker/index.ts` and `simula-workflow-cron-worker/index.ts` select `retry_limit` from `workflow_steps`.
- Both execute each step and transition it to failed when the action throws or returns an error.
- Neither inspected worker imports or calls `decideRetry` from `workflow-retry-policy.mjs`.
- The policy module describes itself as pure decision logic with no I/O, timers, persistence, or implicit retries.
- Existing policy unit tests exercise decisions, not durable scheduling or worker recovery.

Decision: **PARTIAL** — retry policy logic exists; durable retry execution does not. Do not advertise retries as operational. Do not add an in-memory retry loop as a shortcut.

### 3.2 Timeout is cooperative, not preemptive

Evidence:
- `executeWithinStepBudget` checks the deadline before and after calling the synchronous action.
- Its source comment explicitly says it cannot preempt a synchronous function that blocks the JavaScript isolate.

Decision: **PARTIAL** — useful input/output and elapsed-budget guard for synchronous local actions, but not a hard execution timeout. CPU-heavy, blocking, or external actions need an isolated/cancellable job boundary and explicit side-effect policy.

### 3.3 Transactional step fencing is promising but schema-dependent

Evidence from `20261120000000_phase_4n8b_transactional_step_fencing.sql`:
- `simula_transition_workflow_step` locks the parent `workflow_runs` row using `FOR UPDATE`.
- It checks owner, running status, and exact parent attempt generation.
- It validates workflow ownership and that the step belongs to the workflow.
- It limits transitions to `start`, `succeed`, and `fail`.
- It grants execution to `service_role` and revokes it from `public`, `anon`, and `authenticated`.

However, the migration assumes existing relations and a unique conflict target on `workflow_step_runs(run_id, step_id)`. Their authoritative DDL, RLS, grants, indexes, triggers, and recovery RPC definitions were not present in the inspected tracked migration directory.

Decision: **PARTIAL / BLOCKED for database rollout**. Source-level design is inspectable; compatibility with the actual database schema and all state writers is not proven.

### 3.4 Worker finalization still needs a full writer/lock-order inventory

The inspected workers use conditional updates for run completion/failure with predicates on run ID, owner, running status, and attempt generation. This is useful compare-and-set protection. It is not sufficient evidence by itself that queue claim, stale recovery, cancellation, cron, manual retry, and all other writers share one compatible lock order.

Decision: **UNASSESSED** until every writer and RPC definition is located and reviewed.

## 4. Database provenance gate

The tracked migration inventory on the inspected branch contains the Phase 4N.8B fencing migration, which references:
- `workflow_runs`
- `workflows`
- `workflow_steps`
- `workflow_step_runs`

The inspected branch does not provide the authoritative base table DDL or the complete queue-claim / stale-recovery SQL contract needed to verify:
- primary and foreign keys;
- unique constraints and status constraints;
- indexes and enum definitions;
- RLS policies and grants;
- triggers and SECURITY DEFINER functions;
- lock ordering across queue claim, recovery, cancellation, and finalization;
- whether recovery advances the parent attempt under the same serialization point.

**Gate:** do not author or apply an attempt-ledger migration from inferred schema. Obtain the original migrations/schema dump or a read-only export from a disposable non-production environment first.

## 5. Safe target architecture

1. Keep `workflow_runs.attempt` as the parent-generation stale-worker fence.
2. Keep the existing step summary as a projection, not as the durable retry history.
3. After schema provenance is verified, consider an append-only `workflow_step_attempts` ledger with per-step attempt number, lease identity, availability time, bounded error metadata, and explicit `outcome_unknown` state.
4. Make database RPCs the authority for claim, schedule, completion, retry limits, elapsed-time limits, and stale recovery.
5. Use a transactional outbox and downstream idempotency keys for external side effects. Never assume database fencing alone provides exactly-once remote execution.
6. Keep deterministic local actions separate from provider-backed actions. Unknown action types and untrusted model output must fail closed.
7. Keep the canonical backend decision explicit; do not allow Supabase Edge Functions and a second API service to own the same workflow transition.

## 6. Required test matrix before implementation approval

All database tests must use a disposable local/non-production PostgreSQL or Supabase instance and invoke the actual RPCs.

| Test | Required invariant |
|---|---|
| Two workers claim the same run/step concurrently | At most one valid active lease |
| Duplicate completion | One terminal transition; replay rejected |
| Recovery races with completion | One serializable winner; stale completion rejected |
| Parent generation advances during action | Old generation cannot commit |
| Retry limit and elapsed-time boundary | No over-limit schedule |
| Retry classification | Unknown, validation, and authorization errors do not retry |
| Lost claim response | No duplicate active attempt |
| External request times out ambiguously | No blind non-idempotent redelivery |
| Cross-owner and cross-workflow step IDs | Rejected |
| Privilege checks | Internal RPCs unavailable to anon/authenticated |
| Missing DB fixture in CI | Mandatory integration job fails, not silently skips |

Fast pure unit tests may run separately, but they must not substitute for this integration suite.

## 7. Integration sequence

1. Recover authoritative schema and migration history.
2. Inventory all workflow state writers and build a lock-order graph.
3. Reconcile branch ancestry and duplicate/overlapping migration/object names.
4. Resolve worker security, CORS, secret verification, and service-role boundaries.
5. Design the attempt ledger against verified constraints.
6. Implement transactional claim/schedule/complete/recover RPCs in a separate reviewed change.
7. Add mandatory disposable-database concurrency tests.
8. Run frontend integration and real browser/accessibility tests separately.
9. Perform security and operational review.
10. Obtain explicit human approval before merge, migration, or deployment.

## 8. Status ledger

| Area | Status | Evidence boundary |
|---|---|---|
| Branch ancestry comparisons | VERIFIED | GitHub compare endpoint for listed refs |
| Retry decision module | VERIFIED | Source and unit-test files exist |
| Retry execution in inspected workers | NOT IMPLEMENTED | No policy call found in either worker |
| Cooperative timeout helper | VERIFIED | Source implementation and explicit limitation |
| Hard timeout / cancellation | BLOCKED | Synchronous action cannot be preempted |
| Parent-run transition fence | PARTIAL | Migration source inspected |
| Historical migration source | BLOCKED | Original SQL bodies are not tracked in the inspected migration tree; current live schema metadata was subsequently inspected read-only |
| All workflow state writers | UNASSESSED | Complete RPC/writer inventory pending |
| Real DB concurrency tests | NOT TESTED | No passing disposable DB run evidence |
| Production migration / deployment | NOT AUTHORIZED | None performed |

## 9. Safety boundary

This audit is a planning and source-inspection artifact. It does not:
- merge, close, or retarget existing PRs;
- delete or rewrite branches;
- apply SQL or mutate Supabase;
- change secrets, billing, or hosting configuration;
- deploy or publish;
- claim that the whole repository or production system is fully audited.

**Final decision:** preserve the current branch stack, keep retry execution disabled, use the read-only live schema snapshot below to validate candidate assumptions, and test actual database concurrency before any runtime rollout.


## 10. Read-only live Supabase schema and runtime addendum

**Inspection date:** 2026-11-20  
**Project:** Ashaa-INX  
**Method:** Supabase metadata APIs and read-only PostgreSQL catalog queries only. No table rows were selected, no secrets were retrieved, and no database or function configuration was changed.

### 10.1 Live project and migration inventory

- Project status: `ACTIVE_HEALTHY`.
- PostgreSQL engine: 17.11.
- Public application tables reported: 14.
- Applied migration ledger entries: 19.
- Latest listed migration: `20261103134302_ashaa_backend_credit_ledger`.
- The Phase 4N.8B migration `20261120000000_phase_4n8b_transactional_step_fencing.sql` is **not** present in the applied migration ledger.
- The three workflow worker/API-key Edge Functions are reported active.

This confirms that the live database can be inspected as the current schema authority. It does not recover the historical SQL body of every applied migration or prove that the GitHub candidate source matches the deployed functions.

### 10.2 Workflow relation compatibility

The live catalog confirms these relations and the columns referenced by the Phase 4N.8B candidate:

- `workflows`: `id`, `owner_id`, `status`, `trigger_type`, `next_run_at`, timestamps and configuration fields.
- `workflow_steps`: `id`, `workflow_id`, `step_order`, `action_type`, `config`, `retry_limit`, `timeout_seconds`.
- `workflow_runs`: `id`, `workflow_id`, `owner_id`, `status`, `attempt`, input/output, error and lifecycle timestamps.
- `workflow_step_runs`: `id`, `run_id`, `step_id`, `owner_id`, `status`, `attempt`, input/output, error and lifecycle timestamps.
- `workflow_logs`: owner/workflow/run references, level, event, details and timestamp.

Important live constraints include:

- `workflow_step_runs UNIQUE (run_id, step_id)`.
- `workflow_steps UNIQUE (workflow_id, step_order)`.
- `workflow_runs` unique index on `(workflow_id, scheduled_for)`.
- Foreign keys connect runs to workflows and step runs to both parent runs and workflow steps.
- The live workflow tables have RLS enabled.

**Compatibility result:** the live relation/column/unique-key metadata matches the specific table references and `ON CONFLICT (run_id, step_id)` assumption used by the Phase 4N.8B candidate migration. This is a schema-compatibility observation, not proof that the migration is safe to apply or that its transaction behavior is correct.

### 10.3 Live row-security policy inventory

The inspected policies currently provide:

- `workflows`: authenticated owners manage rows where `owner_id = auth.uid()`, with matching `WITH CHECK`.
- `workflow_steps`: authenticated access is scoped through the parent workflow owner.
- `workflow_runs`: owners can select their rows and insert only when both the run owner and parent workflow owner match the authenticated user.
- `workflow_step_runs`: owners can select rows by `owner_id`; no authenticated write policy was observed.
- `workflow_logs`: owners can select rows by `owner_id`.
- `profiles`: owners can select/update their own profile; update has a matching `WITH CHECK`.

Do not add browser-side write permissions for worker-owned state transitions. Continue to route those transitions through narrowly granted server-side RPCs.

### 10.4 Live RPC and queue-recovery findings

The live catalog contains:

- `private.simula_claim_workflow_runs` and a public wrapper for authenticated owner-scoped claiming.
- `private.simula_claim_workflow_runs_internal` and a public wrapper executable by `service_role`.
- `public.simula_verify_worker_secret`, executable by `service_role`.

The internal claim implementation performs stale-run recovery and queue claiming. It marks sufficiently old runs at the attempt ceiling as failed, re-queues older running attempts below the ceiling, then claims queued runs using `FOR UPDATE SKIP LOCKED` and increments the parent attempt.

**Not present in the live catalog:** `simula_transition_workflow_step`. The Phase 4N.8B transactional step-fencing RPC is therefore a repository candidate and is not deployed in the inspected project.

Before rollout, inventory every caller and state writer, confirm a common parent-row lock order with claim/recovery/finalization, and execute the real two-worker race tests against a disposable database.

### 10.5 Live Edge Function drift

Three Edge Functions are reported active. Their deployed source hashes differ from the source files in the isolated PR #46 canonical-source candidate.

Observed source-level differences:

- The deployed authenticated workflow worker uses wildcard CORS; the PR #46 candidate uses the shared origin-allowlist module.
- The deployed API-key manager uses wildcard CORS; the PR #46 candidate uses the shared origin-allowlist module.
- The deployed cron worker is configured without platform JWT verification and performs its own worker-secret verification. Keep that endpoint server-to-server only; do not weaken its secret verification.
- The deployed worker sources do not call the Phase 4N.8B `simula_transition_workflow_step` RPC.

These findings establish source drift. They do not establish exploitability or justify an immediate production deployment. Confirm the approved browser origins and perform a complete diff/security review before any separately approved function rollout.

### 10.6 Security-advisor observation

The security advisor returned one informational finding: `public.billing_webhook_events` has RLS enabled but no policies. This is deny-by-default for ordinary RLS-governed access and may be intentional for a server-only table. Confirm intended access paths and service-role usage; do not add broad policies just to silence the notice.

### 10.7 Data and test boundaries

- The metadata API reported zero rows for the inspected workflow tables at this snapshot. No row contents were read.
- The Phase 4N.8B migration remains unapplied.
- The earlier PR #38 report says the mutating disposable-database concurrency test was ignored because fixture variables were not supplied.
- No real two-worker transactional race has been verified by the evidence inspected here.
- No migration, function deployment, secret change, production write, merge, or hosting deployment was performed.

### 10.8 Updated status ledger

| Area | Status | Evidence boundary |
|---|---|---|
| Current live workflow table/column metadata | VERIFIED | Read-only Supabase catalog/table metadata |
| Key unique/FK constraints | VERIFIED | Read-only PostgreSQL catalog |
| Current owner-scoped RLS policies | VERIFIED | Read-only `pg_policies` inventory |
| Historical SQL bodies for all 19 migrations | BLOCKED | Migration names available; original SQL bodies not recovered |
| Phase 4N.8B table-reference compatibility | PARTIAL | Referenced columns and conflict key match live metadata |
| Phase 4N.8B RPC deployed | NOT DEPLOYED | Function absent from live catalog and migration ledger |
| All queue/recovery/finalization writers | PARTIAL | Claim/recovery RPC inspected; complete writer inventory still required |
| Deployed Edge Function parity | DRIFT CONFIRMED | Live hashes/source differ from PR #46 candidate |
| Real database concurrency test | NOT TESTED | Disposable fixture test was previously skipped |
| Retry execution / durable retry scheduling | NOT IMPLEMENTED / NOT VERIFIED | Pure retry policy is not evidence of durable execution |
| Production migration / function deployment | NOT AUTHORIZED | No production changes performed |

**Updated decision:** use the recovered live schema metadata to finish a source-to-database compatibility review. Keep PR #35 and PR #46 isolated and in Draft. The next implementation gate is a disposable PostgreSQL/Supabase test environment using a verified schema snapshot, mandatory two-worker concurrency tests, and complete worker-writer review. Do not deploy the candidate functions or apply the fencing migration to the live project as part of this phase.


## 11. PR #35 source-level correctness review and test-quality gate

**Reviewed source:** PR #35 head `3b19c7c502ddfa17261ba457ee6757311b5e2032`  
**Reviewed files:** transactional migration, worker call sites, SQL grant test, Deno integration test, and CI workflow.

### 11.1 Positive implementation properties

- The RPC uses a fixed empty `search_path` and schema-qualified table references.
- The RPC is `SECURITY DEFINER` and explicitly revokes execution from `PUBLIC`, `anon`, and `authenticated`, granting execution to `service_role`.
- Every transition first locks the parent `workflow_runs` row with `FOR UPDATE`.
- The RPC checks parent owner, `running` status, exact attempt generation, workflow ownership, and step membership.
- Terminal transitions require a matching running step row with the exact attempt generation.
- Both worker paths call the same RPC rather than independently mutating step-run rows.

### 11.2 Required corrections / unresolved proof

1. **The CI integration test is allowed to skip.** Its `ignore: !configured` condition means the job can pass without running the two-client race. PR #38 explicitly confirms that the test was ignored because fixture variables were not supplied. A green CI result is therefore not a concurrency pass.
2. **The current integration test mutates its fixture.** It advances the parent attempt after the start race and does not restore it. This is acceptable only for an isolated disposable fixture, never a shared or production database.
3. **The fixture preflight is incomplete.** It reads the selected step but does not assert that `step.workflow_id === run.workflow_id`. The RPC itself checks membership, but the test should verify the fixture is correctly constructed before exercising the race.
4. **The SQL test is grant-only.** It proves function presence and role grants, not transition semantics, stale-generation rejection, rollback behavior, or lock interaction with claim/recovery.
5. **Cross-writer lock-order proof remains incomplete.** The live claim/recovery routine and every worker finalization path must be reviewed together with the new parent-row lock. Do not infer deadlock freedom from the isolated RPC body.
6. **The CI workflow has no provisioned disposable database fixture.** It runs the Deno integration test without guaranteed fixture variables; the test is therefore optional rather than a required release gate.

### 11.3 Next safe engineering change

Do not modify or apply the live database. Keep PR #35 Draft. Build a dedicated CI-only PostgreSQL 17 harness from a reviewed, minimal test schema contract, then execute the migration and semantic tests against that disposable database. The harness must:
- fail if the integration test is skipped;
- verify service-role-only execution and deny anon/authenticated execution;
- verify valid start/succeed/fail transitions;
- reject wrong owner, wrong workflow-step membership, invalid transition, and stale generation;
- prove exactly one same-generation concurrent start succeeds;
- prove stale completion cannot overwrite a newer generation;
- exercise lock interaction with the actual claim/recovery SQL or explicitly retain that check as BLOCKED;
- use generated fixture IDs and a teardown/reset strategy;
- never receive production Supabase URLs, service-role keys, or production data.

A standalone PostgreSQL harness may validate the SQL RPC and locking contract, but it must not be represented as a full Supabase Auth/PostgREST/Edge Runtime integration test. Keep those boundaries explicit.

### 11.4 Updated release gate

| Gate | Status | Evidence required |
|---|---|---|
| RPC source review | PARTIAL PASS | Static review of PR #35 migration and both worker call sites |
| RPC least-privilege grants | PARTIAL | SQL assertions authored; execution not evidenced |
| Semantic SQL tests | BLOCKED | Disposable PostgreSQL 17 execution |
| Concurrent start race | NOT VERIFIED | Test currently skippable; actual two-session run required |
| Stale-generation completion | NOT VERIFIED | Actual disposable DB test required |
| Claim/recovery lock-order interaction | BLOCKED | Complete writer inventory and race/deadlock tests |
| Production migration | NOT AUTHORIZED | Explicit approval after all gates |

**Decision:** no merge, migration, Edge Function deployment, or production release based solely on current PR #35 CI. The next implementation unit is the disposable PostgreSQL 17 semantic/concurrency harness, with skip treated as failure.
