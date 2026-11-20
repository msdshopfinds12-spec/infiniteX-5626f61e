# Phase 51 — Existing Workflow Contract Inventory

**Status:** Source/type inspection only; no runtime changes  
**Baseline ref:** `feat/phase-50-trusted-authorization`  
**Inspection date:** 2026-11-20

## 1. Evidence reviewed

- `src/features/workflows/workflow-run-request.ts`
- `src/features/workflows/workflow-run-request.test.ts`
- `src/lib/supabase/database.types.ts`
- `supabase/functions/simula-workflow-worker/index.ts`
- `supabase/functions/simula-workflow-cron-worker/index.ts`
- `supabase/functions/_shared/worker-security.mjs`
- Existing live schema/authorization baseline documents and Phase 50.3 reliability gap analysis.

This is not a substitute for a fresh live schema query or isolated integration test.

## 2. Current client enqueue contract

The current `createWorkflowRunRequest(workflowId, input?)` helper produces a frozen request with exactly:
- `workflow_id`
- `input`

It trims and requires workflow ID, defaults omitted input to an empty object, deep-clones/freezes JSON, rejects cycles, non-finite numbers, non-JSON values, accessors, sparse arrays, symbol keys, and non-plain object prototypes. Its tests include prototype-pollution handling for `__proto__`.

**Boundary:** this helper creates a client request shape; it does not prove that the UI is already wired to a trusted enqueue endpoint or that a server-side idempotency contract exists.

## 3. Current worker execution contract

Both user and cron workers:
1. Validate request method and body size.
2. Authenticate differently (user JWT for user worker; verified worker secret for cron worker).
3. Claim a bounded batch through the appropriate RPC.
4. Validate claimed run shape and workflow ownership.
5. Load ordered workflow steps.
6. Create/update one `workflow_step_runs` row per run/step.
7. Execute an allowlisted local action.
8. Persist step and run success/failure using run attempt generation predicates.

The user worker derives owner from `auth.getUser(token)`; cron worker derives owner from the verified internal queue claim. Neither should accept a browser-provided owner ID.

## 4. Critical data-model limitation: one step-run row is not attempt history

Generated database types show `workflow_step_runs` has one `attempt` integer and one row identity with `run_id` and `step_id`. Existing worker logic queries a previous row by `run_id + step_id + owner_id`, then updates that row only when its stored `attempt` is lower than the current run generation. The insert path handles a uniqueness race by attempting the same conditional update.

This is a **generation-fencing record**, not an append-only history of each retry. Reusing it for per-step retries would overwrite the prior attempt's status, input/output, error and timestamps. A durable retry design therefore needs a separate attempt-history relation (or a carefully designed composite attempt key) and a unique, transactional claim/transition contract.

**Do not implement retry by simply looping the current action and incrementing this column.**

## 5. Retry and run-generation semantics are currently different

- Current `workflow_runs.attempt` is used as a worker claim generation / stale-worker fence.
- Current `workflow_step_runs.attempt` is set from that same run generation.
- `workflow_steps.retry_limit` is selected by both workers but is not used to schedule or bound retry attempts in the inspected execution loops.

The Phase 51 implementation must not conflate:
1. run claim generation (fencing token / generation),
2. logical step attempt number (retry count),
3. delivery count (queue redelivery).

These are distinct counters with different semantics.

## 6. Current action and timeout contract

The worker action switch is an explicit allowlist of local deterministic transformations (pass-through, set/merge JSON, and text case/append/prepend). Unknown action types fail. This is safer than evaluating arbitrary workflow-provided code.

The shared execution-budget helper checks monotonic time before and after a synchronous action and bounds serialized input/output size. It cannot preempt a synchronous action while that action blocks the isolate. Treat this as a cooperative guard, not a hard execution timeout.

Runtime timeout validation currently accepts 1–300 seconds; the live schema finding reports a database constraint range of 1–3600 seconds. Existing values must be inventoried before proposing a constraint change.

## 7. Current enqueue and lifecycle privilege implications

The live schema baseline reports authenticated INSERT grants on worker-owned workflow run lifecycle columns, with a protective trigger that overwrites several fields to safe initial defaults. The current typed `workflow_runs.Insert` still models many lifecycle fields as optional because it reflects database schema, not the intended browser contract.

The browser contract must remain `WorkflowRunRequest`; do not use generated `TablesInsert<"workflow_runs">` directly from UI code. A trusted server enqueue path should derive owner and set initial lifecycle state. Any grant narrowing is a separate migration proposal after complete frontend and RPC dependency review.

## 8. Specific implementation gates

Before WP3 pure helpers are integrated:
- Map all actual status values and legal transitions from database constraints, RPC definitions, and worker source.
- Confirm uniqueness constraints on `workflow_step_runs` and `workflow_runs` from live catalog.
- Confirm exact claim RPC SQL and EXECUTE grants.
- Confirm all enqueue call sites and whether an idempotency key exists.
- Inventory existing timeout values above the proposed maximum.
- Define whether retry is safe for every allowlisted action; future external side effects require provider idempotency or an outbox.

## 9. Current status

| Area | Status | Evidence |
|---|---|---|
| Minimal immutable client request builder | VERIFIED (source/tests) | Request helper and tests |
| User worker derives owner from verified JWT | VERIFIED (source) | User worker |
| Cron worker has independent secret verification | VERIFIED (source) | Cron worker |
| Workflow ownership checked before step loading | VERIFIED (source) | Both workers |
| Allowlisted local action dispatch | VERIFIED (source) | Both workers |
| Stale run-generation fencing | VERIFIED (source) | Conditional step/run updates |
| Per-step retry_limit enforcement | NOT IMPLEMENTED in inspected source | Field selected but unused |
| Append-only step attempt history | NOT IMPLEMENTED in inspected schema/types | Single step-run row per run/step |
| Durable retry scheduling | NOT IMPLEMENTED in inspected worker source | No persisted next_retry_at behavior |
| Hard preemptive synchronous timeout | NOT SUPPORTED | Cooperative helper only |
| Browser-to-trusted-enqueue wiring and idempotency | NOT VERIFIED | Requires call-site inventory |
| Production-safe timeout contract parity | BLOCKED | DB/runtime mismatch |

## 10. Safety

No source runtime behavior was changed in this inventory. No migrations, grants, RLS, data, secrets, deployments, merges, or releases were changed.

## 11. Frontend integration status

Additional source inspection of `src/App.tsx`, `src/components/PipelineBoard.tsx`, and `src/types.ts` confirms the current dashboard explicitly labels its metrics, agents, logs, and pipeline rows as illustrative demo data. Pipeline rows are hard-coded local constants; pipeline actions are disabled. The App demo notice explicitly states that no live backend, agent runtime, pipeline, log stream, or security scan is connected or verified.

The immutable `createWorkflowRunRequest` helper exists and is tested, but the inspected App and PipelineBoard do not import it or call a workflow enqueue endpoint. The inspected source tree has no separate workflow API client or workflow UI feature module.

**Conclusion:** do not describe the workflow engine as integrated end-to-end. The next product integration milestone must include a real workflow list/detail/run UI, a trusted enqueue API adapter, safe run status projection, loading/error/empty states, and synthetic integration tests. Keep the demo components clearly labeled until that integration is complete.

## 12. Updated status

| Area | Status | Evidence |
|---|---|---|
| Dashboard telemetry and pipeline board | DEMO ONLY | App and PipelineBoard source |
| Workflow request helper | VERIFIED (isolated helper) | Unit-tested helper |
| Request helper wired to workflow UI/API | NOT IMPLEMENTED in inspected source | No import/call site in inspected UI tree |
| Live workflow execution visible in UI | NOT IMPLEMENTED | Demo-only pipeline board |
