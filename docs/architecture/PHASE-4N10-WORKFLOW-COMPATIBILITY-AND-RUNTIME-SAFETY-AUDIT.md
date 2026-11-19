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
| Authoritative base schema | BLOCKED | Not located in inspected migration tree |
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

**Final decision:** preserve the current branch stack, keep retry execution disabled, recover schema provenance, and test actual database concurrency before any runtime rollout.
