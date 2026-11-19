# Phase 4N.8A — Workflow Attempt-Generation Fencing

**Status:** CI verified on the latest PR head; concurrency-interleaving coverage is incomplete; not release ready.  
**Base commit:** `fa0f203f644b936de935000c993c47c91587af06` (`feat/phase-4n7-workflow-reliability`)  
**Working branch:** `fix/phase-4n8a-attempt-fencing`  
**Release policy:** no merge, migration, secret change, billing change, or production deployment without separate approval.

## 1. Objective

Prevent an older worker execution from overwriting state written by a newer claim after the existing stale-run recovery procedure increments `workflow_runs.attempt`.

This phase is code-only and uses the already verified `workflow_runs.attempt` and `workflow_step_runs.attempt` integer columns. It does not add columns, tables, indexes, policies, grants, or RPCs.

## 2. Design

### Run fencing

Every success and failure update to `workflow_runs` now includes all existing ownership/state predicates plus:

```ts
.eq("attempt", run.attempt)
.select("id")
.maybeSingle()
```

A zero-row result means the worker no longer owns the current generation. The worker reports the run as `superseded` and does not mark the newer execution failed or succeeded.

Claimed runs are rejected unless `attempt` is a positive safe integer.

### Step fencing

`workflow_step_runs.attempt` is treated as the workflow-run generation, rather than independently incremented per worker process. This is consistent with the current execution model: deterministic local actions execute once per claimed workflow generation, and the existing database has a unique constraint on `(run_id, step_id)`.

A step start uses a conditional update only when the stored generation is lower than the claimed run generation:

```ts
.update(stepRunPayload)
.eq("run_id", run.id)
.eq("step_id", step.id)
.eq("owner_id", ownerId)
.lt("attempt", run.attempt)
.select("id")
.maybeSingle()
```

For a missing step row, it attempts an insert. A unique-key race is resolved by retrying the same conditional generation update. Step success/failure updates also require exact equality with the generation that started the step.

This prevents an older generation from replacing a step row after a newer generation has already advanced that row. **It does not fully close the race between a newer run claim and the newer worker's first write to a given step row.** Because the current REST update to `workflow_step_runs` cannot atomically predicate on the parent `workflow_runs.attempt`, an older worker may still insert or update a not-yet-advanced step row after a newer run generation has been claimed. A later write by the newer worker will advance it, but if that worker stops before reaching the step, the older generation's step row may remain visible. This is a known limitation and blocks claiming complete stale-worker isolation.

### Superseded outcome

A worker whose conditional update affects no row does not write a terminal state for a newer attempt. The API response includes an additive `superseded` count and per-run `status: "superseded"` outcome.

## 3. Important limits

- These are database conditional writes using the existing REST/PostgREST update filters. The phase does not introduce a new transaction or claim RPC.
- The existing claim RPC remains the authority for atomically claiming workflow runs.
- The step generation interpretation is safe for the current one-execution-per-step-per-workflow-attempt model. If future per-step retries are introduced, their attempt identity must be modeled separately and reviewed before implementation.
- This does not provide exactly-once execution of external side effects. Current actions are deterministic local transformations. Future external adapters still require provider-enforced idempotency or a durable deduplication contract.
- A stale worker may have already performed bounded local computation before its conditional completion is rejected. The current local actions have no external side effects.
- The current 15-minute stale-run recovery lease and attempt cap remain unchanged.

## 4. Regression coverage

Node and Deno tests validate positive safe-integer attempt generations and reject missing/zero/negative/fractional/string/unsafe values. They do **not** yet simulate two workers interleaving across claim, step start, step completion, and recovery. Therefore the concurrency guarantee is source-reviewed but not integration-tested.

The GitHub Actions workflow runs:
- `npm ci`
- Node worker-security and CORS regression suites
- Deno worker-security regression suite
- Deno type checks for authenticated worker, cron worker, and API-key manager
- `npm run build`

GitHub Actions verified the exact prior head `6038835189f1b718a81f894fc1292dafeaeaad49` with successful push and pull-request runs. The runs executed `npm ci`, Node/CORS tests (16 total), Deno tests (6), all three Edge Function type checks, and `npm run build`. The current documentation-only follow-up must receive its own CI run before the updated head is considered verified. CI does not establish the missing concurrency interleaving guarantee.

## 5. Security and change boundaries

- Preserve authenticated user claim RPC and cron custom-secret verification RPC.
- Preserve exact-origin CORS and streamed request-body limits.
- Preserve service-role credentials as server-only environment values.
- No schema changes or live database writes.
- No secret/configuration changes.
- No merge to `main`.
- No deployment or production function update.
- No paid services or billing changes.

## 6. Exit criteria

1. Node regression suite passes on the exact PR head.
2. Deno regression suite passes on the exact PR head.
3. All three Edge Functions type-check.
4. Application build passes.
5. Diff review confirms all run terminal writes are attempt-fenced.
6. Diff review confirms all step terminal writes are generation-fenced.
7. Add transactional parent-run generation checks for step start/terminal updates, or a verified equivalent that closes the claim-to-step race.
8. Add deterministic two-worker interleaving tests for old-worker completion after newer claim, including a step not yet reached by the newer worker.
9. No unrelated files or production configuration are changed.
10. Human review and a separate release approval remain required.

**Current assessment:** run terminal writes are fenced; step terminal writes are conditionally fenced by step generation; complete run-to-step generation isolation remains **PARTIAL / NOT TESTED**. Do not merge or deploy until the transactional guard and interleaving tests are complete.
