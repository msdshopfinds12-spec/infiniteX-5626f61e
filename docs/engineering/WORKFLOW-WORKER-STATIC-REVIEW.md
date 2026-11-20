# Workflow Worker Static Review — Phase 64 Next Gate

**Review target:** `engineering/infinitex-canonical-integration-candidate`  
**Review basis:** source files fetched from the candidate branch on 2026-11-21  
**Review mode:** read-only source inspection; this document adds findings only  
**Status:** PARTIAL — source-level findings verified; database/runtime contracts not verified

## Executive decision

Do not enable the workflow workers against production yet. The candidate contains meaningful owner checks, bounded request parsing, attempt-generation compare-and-set updates, and a restricted action allowlist. However, the worker contract is not complete enough to call this production-ready.

## Verified source findings

### WF-01 — Configured retry limit is not implemented

Both `simula-workflow-worker/index.ts` and `simula-workflow-cron-worker/index.ts` select `retry_limit` and include it in the `Step` type, but neither worker reads the value or retries a failed action. A step failure immediately fails the workflow run.

**Impact:** persisted retry configuration is misleading; users can configure retries that have no effect.

**Required fix:** define the retry contract before implementation:
- whether `retry_limit` means retries after the first attempt or total attempts;
- which errors are retryable (transient infrastructure errors only by default);
- whether retry delay/backoff and jitter are required;
- whether every attempt is separately persisted or recorded in an append-only attempt table;
- how a retry is fenced against a newer workflow-run generation.

Do not silently retry arbitrary action/configuration errors. Add deterministic tests for zero retries, one retry, maximum retries, non-retryable failures, and a newer generation superseding an older worker.

### WF-02 — Step timeout is a cooperative budget, not a hard execution timeout

`executeWithinStepBudget` checks a monotonic deadline before and after a synchronous action. Its own comment correctly states that it cannot preempt a synchronous function that blocks the isolate. The currently allowed actions are local string/object transformations, but the helper must not be represented as a hard timeout or reused for arbitrary CPU-bound or external actions.

**Impact:** future actions could block the Edge Function beyond the configured timeout despite the helper name.

**Required fix:** keep the allowlist strictly synchronous and cheap, with bounded input/output; for external or long-running actions use a separately cancellable job boundary with a durable lease, deadline, and idempotency key. Rename/document the current helper as a cooperative budget check if that improves clarity. Add a test proving the contract is explicitly cooperative, not preemptive.

### WF-03 — Step-run compare-and-set depends on unverified database invariants

The workers use a unique-conflict recovery path and conditional updates filtered by `run_id`, `step_id`, `owner_id`, and a lower `attempt` generation. The source-level fencing is useful, but correctness depends on a database uniqueness constraint for the intended step-run identity and on claim RPCs monotonically advancing the workflow-run attempt generation.

**Impact:** without the matching unique constraint and claim-generation semantics, duplicate rows or stale-worker races may not be prevented as intended.

**Required verification:** inspect actual database constraints/indexes and the definitions/privileges of:
- `simula_claim_workflow_runs`
- `simula_claim_workflow_runs_internal`
- `simula_verify_worker_secret`

Verify the unique key for `workflow_step_runs` (expected candidate: `run_id, step_id`), atomic queue claiming, lease expiry/reclaim behavior, attempt increment semantics, and function EXECUTE grants. Do not infer these properties from TypeScript types.

### WF-04 — Worker parity must remain explicit

The authenticated worker and cron worker duplicate the action executor and much of the run/step state machine. Their trust models differ: the authenticated worker validates a user bearer token and claims through the user client; the cron worker validates a worker secret and uses the service-role client.

**Impact:** fixes applied to only one worker can cause divergent behavior or security posture.

**Required fix:** extract shared pure action/state-transition logic into a tested runtime-neutral module where feasible, while keeping authentication, claim RPC selection, and privilege boundaries separate. Add parity tests that run the same action and failure cases against both adapters.

## Existing positive controls observed

- Authenticated worker validates the bearer token with Supabase Auth before deriving the owner ID.
- Authenticated claim results are checked against the authenticated owner.
- Parent workflow is re-read with both workflow ID and owner ID filters.
- Cron worker checks the worker secret through a database RPC before using the internal claim RPC.
- Request bodies are read with a streamed byte limit and strict UTF-8/JSON parsing.
- Queue batch size is clamped.
- Action execution is allowlisted; unknown action types fail closed.
- Step/run completion updates include owner and attempt-generation predicates.
- Workflow log insertion errors are reported without exposing them in the client response.

## Test and release gates

1. Capture genuine read-only database metadata from the intended Supabase project and independently compare it with `src/lib/supabase/database.types.ts`.
2. Verify indexes, constraints, RLS policies, function definitions, function grants, and worker-secret storage/rotation design.
3. Add worker integration tests using an isolated local/test database or deterministic RPC fakes; cover concurrent claims and lease expiry.
4. Add explicit retry semantics and tests before claiming `retry_limit` works.
5. Add tests for malformed claim RPC rows, duplicate step-run insertion races, stale generations, partial failure, and logging failures.
6. Run all candidate CI checks on the exact resulting commit.
7. Keep deployment blocked until a human approves a separate release plan.

## Safe alternatives

- **Preferred now:** keep the worker code disabled from production scheduling; complete schema/RPC verification and deterministic tests first.
- **Lower-risk MVP:** expose only the existing bounded synchronous action allowlist, set retry count to zero in product validation until retry support exists, and clearly label workflow execution as experimental.
- **Long-running actions:** enqueue durable jobs and execute them in a separately leased worker; never run arbitrary user-supplied code inside the current Edge Function action switch.

## Scope boundaries

This review does not prove that functions are deployed, secrets exist, cron is scheduled, schema matches, RLS is correct, or real workflows execute. No migration, secret change, function deployment, production data write, billing change, merge, or release was performed.
