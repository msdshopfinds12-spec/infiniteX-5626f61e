# Workflow Worker Static Review — Phase 64 Next Gate

**Review target:** `engineering/infinitex-canonical-integration-candidate`  
**Review basis:** source files fetched from the candidate branch on 2026-11-21  
**Review mode:** read-only source inspection; this document adds findings only  
**Status:** PARTIAL — source changes and CI verified; live database concurrency proof and deployed-runtime parity remain pending

## Executive decision

Do not enable the workflow workers against production yet. The candidate contains meaningful owner checks, bounded request parsing, attempt-generation compare-and-set updates, and a restricted action allowlist. However, the worker contract is not complete enough to call this production-ready.

## Verified source findings

### WF-01 — Retry policy implemented in candidate; runtime rollout pending

The initial review found that both workers selected `retry_limit` but did not use it. This has been addressed in the candidate branch: both authenticated and cron workers validate the configured limit and call the shared `executeWithRetry` helper.

The contract defines `retry_limit` as additional retries after the initial attempt, accepts 0–10 retries, retries only explicitly tagged transient codes, uses capped exponential full jitter, and enforces one aggregate step timeout across attempts and backoff. Deterministic validation, authorization, malformed-input, and unsupported-action failures are not retried.

The current action allowlist is deterministic and local, so it does not presently emit retryable transient errors. The helper is ready for future external adapters, but those adapters must add idempotency, explicit transient-error mapping, cancellation, and integration tests before retries can be exercised.

See [WORKER-RETRY-POLICY.md](./WORKER-RETRY-POLICY.md). Exact-head CI and deployed-function rollout remain pending. This resolves the source-level omission in the candidate; it does not update the older deployed Supabase functions.

### WF-02 — Step timeout is a cooperative budget, not a hard execution timeout

`executeWithinStepBudget` checks a monotonic deadline before and after a synchronous action. Its own comment correctly states that it cannot preempt a synchronous function that blocks the isolate. The currently allowed actions are local string/object transformations, but the helper must not be represented as a hard timeout or reused for arbitrary CPU-bound or external actions.

**Impact:** future actions could block the Edge Function beyond the configured timeout despite the helper name.

**Required fix:** keep the allowlist strictly synchronous and cheap, with bounded input/output; for external or long-running actions use a separately cancellable job boundary with a durable lease, deadline, and idempotency key. Rename/document the current helper as a cooperative budget check if that improves clarity. Add a test proving the contract is explicitly cooperative, not preemptive.

### WF-03 — Database identity verified; live concurrency proof still pending

The workers use a unique-conflict recovery path and conditional updates filtered by `run_id`, `step_id`, `owner_id`, and a lower `attempt` generation. The database review has now verified `UNIQUE (run_id, step_id)` and the claim RPC's atomic queue-claim/attempt-increment behavior. Both candidate workers now perform an early strict-generation check against the previously read step-run and retain the database conditional update (`attempt < candidate`) as the authoritative compare-and-set. The runtime report documents the verified schema and RPC contract.

**Impact:** without the matching unique constraint and claim-generation semantics, duplicate rows or stale-worker races may not be prevented as intended.

**Remaining verification:** reproduce concurrent claims, lease expiry/reclaim, insert races, and late stale completions against an isolated PostgreSQL/Supabase environment. Also retain the verified definitions/privileges of:
- `simula_claim_workflow_runs`
- `simula_claim_workflow_runs_internal`
- `simula_verify_worker_secret`

Verify the unique key for `workflow_step_runs` (expected candidate: `run_id, step_id`), atomic queue claiming, lease expiry/reclaim behavior, attempt increment semantics, and function EXECUTE grants. Do not infer these properties from TypeScript types.

### WF-04 — Shared action executor extracted; state-machine parity remains

The authenticated worker and cron worker now import the same runtime-neutral `workflow-actions.mjs` action executor, with independent unit tests. They still duplicate much of the run/step persistence state machine. Their trust models differ: the authenticated worker validates a user bearer token and claims through the user client; the cron worker validates a worker secret and uses the service-role client.

**Impact:** fixes applied to only one worker can cause divergent behavior or security posture.

**Remaining work:** keep authentication, claim RPC selection, and privilege boundaries separate; add adapter-level parity/integration tests for the same action and failure cases. Do not unify privileged database adapters merely to remove duplication.

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
3. Add worker integration tests using an isolated local/test database or deterministic RPC fakes; cover concurrent claims and lease expiry. Current deterministic concurrency-model tests are contract tests, not PostgreSQL concurrency proof.
4. Retry semantics are now implemented and covered by Node/Deno tests; external action adapters still need idempotency and integration tests before retrying real upstream calls.
5. Add tests for malformed claim RPC rows, duplicate step-run insertion races, stale generations, partial failure, and logging failures.
6. Run all candidate CI checks on the exact resulting commit.
7. Keep deployment blocked until a human approves a separate release plan.

## Safe alternatives

- **Preferred now:** keep the worker code disabled from production scheduling; complete schema/RPC verification and deterministic tests first.
- **Lower-risk MVP:** expose only the existing bounded synchronous action allowlist, set retry count to zero in product validation until retry support exists, and clearly label workflow execution as experimental.
- **Long-running actions:** enqueue durable jobs and execute them in a separately leased worker; never run arbitrary user-supplied code inside the current Edge Function action switch.

## Scope boundaries

This review does not prove that functions are deployed, secrets exist, cron is scheduled, schema matches, RLS is correct, or real workflows execute. No migration, secret change, function deployment, production data write, billing change, merge, or release was performed.
