# Phase 4N.8C — Workflow Reliability Engineering

**Status:** Design and source-audit checkpoint  
**Target base:** Phase 4N.8B implementation branch  
**Production changes:** None  
**Database migration applied:** No  
**Verification status:** Source inspected; runtime/database behavior not yet verified

## 1. Objective

Harden InfiniteX workflow execution against worker crashes, duplicate delivery, stale recovery, retry exhaustion, and ambiguous outcomes. Preserve the Phase 4N.8B transactional step-fencing boundary.

This phase must not claim exactly-once execution for external side effects. The achievable contract is:
- at-least-once delivery where required;
- idempotent processing for actions with stable idempotency keys;
- fenced database state transitions;
- explicit reconciliation for uncertain external outcomes.

## 2. Source-audit findings

The following findings are based on the Phase 4N.8B source files inspected for this branch.

### F-01 — Retry configuration is read but not enforced — BLOCKED pending state-model design

Both workers select `retry_limit`, but neither execution loop enforces it. The current fencing RPC permits `start`, `succeed`, and `fail`, and its uniqueness rule allows a step row to be restarted only when the parent run generation increases. A naive retry loop within the same generation would be rejected by the existing transition contract; incrementing the parent run generation for a single-step retry would also change the fencing identity for the whole run.

**Decision:** do not add a superficial retry loop. First design a separate per-step execution generation/attempt and lease identity, plus retry scheduling fields and a transactional claim/retry transition. Specify retryable error classes, maximum elapsed time, backoff, jitter, and terminal states. Validation, authorization, and deterministic configuration errors must not retry.

### F-02 — Worker implementations duplicate the execution pipeline — PARTIALLY REDUCED

The authenticated worker and cron worker previously duplicated the allowlisted local action dispatcher. Phase 4N.8C now extracts that deterministic action contract into `supabase/functions/_shared/workflow-actions.mjs`, with Node regression tests, and both workers import the same implementation. The CI workflow now runs those tests.

**Remaining:** step orchestration, transition handling, logging, and run finalization are still duplicated. A full shared orchestrator extraction is deferred until typed contracts and parity tests are in place; changing both entry points at once without those tests would increase regression risk.

### F-03 — Step start is intentionally single-winner per generation

The SQL RPC permits an existing step row to be replaced only when the incoming run attempt is greater than the stored attempt. A repeated `start` for the same run/step/attempt is rejected.

**Required change:** preserve single-winner semantics. Add explicit tests for duplicate delivery, lost RPC response, stale worker completion, and recovery advancing the generation. Do not make same-generation start silently overwrite a running step.

### F-04 — Recovery race coverage is incomplete

The current integration test races two starts and checks stale completion after directly incrementing the parent run attempt. It does not invoke the actual production stale-recovery/claim path.

**Required change:** test the real recovery RPC or function against a concurrent worker transition using isolated disposable fixtures.

### F-05 — Database integration test is optional when fixture variables are absent

The CI workflow runs the Deno integration test, but the test uses `ignore: !configured`. Missing fixture configuration therefore skips the test instead of failing a required verification job.

**Required change:** split fast source checks from required database integration. A required integration job must fail closed when its disposable database fixture is unavailable. Do not point CI at production.

### F-06 — External side-effect contract must remain explicit

The currently inspected safe action dispatcher contains local JSON transformations; it does not currently expose arbitrary external API actions. If external actions are introduced, database fencing alone will not prevent duplicate remote effects after a crash or uncertain network response.

**Required change before enabling external actions:** durable action identity, downstream idempotency key, transactional outbox, delivery attempts, and reconciliation state. External action types must remain disabled until these guarantees and tests exist.

## 3. Target architecture

1. **HTTP adapters:** authenticated user worker and secret-authenticated cron worker. Own request validation, CORS, authentication, and queue claim entry.
2. **Shared orchestrator:** deterministic step ordering, validation, retry policy, timeout budget, and state-machine decisions.
3. **Fencing boundary:** PostgreSQL RPC serializes state transitions against the parent workflow-run generation.
4. **Recovery coordinator:** atomically claims expired runs, advances generation, records recovery reason, and prevents stale workers from committing.
5. **Action execution boundary:** allowlisted local actions initially; external actions require a separately reviewed idempotent adapter.
6. **Outbox and reconciliation:** required only when durable external side effects are introduced; commit intent transactionally before delivery.
7. **Observability:** structured event codes, run/step IDs, attempt generation, elapsed time, retry classification, and redacted error metadata.

## 4. State-machine contract

- A run is executable only while its status and attempt generation match the worker's claim.
- A step can start at most once per run/step/generation.
- A step can complete only if its parent run is still running at the same generation and the step is running at that generation.
- Recovery must advance the generation under the same parent-row serialization boundary used by step transitions.
- A stale worker must not mutate current-generation database state.
- Retry is bounded and classified; it must never be an unbounded loop.
- Unknown or ambiguous external outcomes enter reconciliation; they must not be blindly repeated.

## 5. Required verification matrix

| Scenario | Expected result |
|---|---|
| Two workers start same step in same generation | Exactly one start succeeds |
| Old worker completes after generation advances | Completion rejected |
| Recovery races with step completion | One serialized winner; no stale state overwrite |
| Worker crashes after step start | Recovery advances generation; old worker fenced |
| Retryable transient failure | Retry only within configured limit and deadline |
| Non-retryable validation/auth failure | No retry |
| Retry limit exhausted | Run reaches documented terminal/recovery state |
| Missing disposable DB fixture in required CI | Job fails, never silently skips |
| Duplicate external delivery (future capability) | Same idempotency key; no duplicate downstream effect where provider supports it |
| Provider outcome unknown (future capability) | Reconciliation required before another side-effect attempt |

## 6. Implementation order and gates

### 4N.8C.1 — Shared execution contract
- Define typed result/error categories.
- Extract shared orchestration without changing authentication adapters.
- Add parity tests for both entry points.

### 4N.8C.2 — Retry policy
- Specify retryable versus terminal error classes.
- Enforce retry_limit and bounded backoff.
- Add deterministic tests using an injected clock; no real sleeps.

### 4N.8C.3 — Recovery race tests
- Build isolated fixtures in a disposable local Supabase/PostgreSQL environment.
- Exercise production claim/recovery routines, not a hand-written attempt update.
- Assert cleanup and fixture isolation.

### 4N.8C.4 — Required CI integration
- Keep fast Node/Deno checks separate.
- Require a disposable database integration job.
- Fail closed when the integration fixture is missing.
- Never use production credentials or production data.

### 4N.8C.5 — External action readiness
- Keep external action types disabled until outbox/idempotency/reconciliation are implemented and reviewed.

## 7. Release gates

This branch is not production-ready merely because source checks pass. Release requires:
- migration review and explicit approval;
- disposable database race tests passing;
- worker parity tests passing;
- retry/recovery state-machine tests passing;
- security review of RPC grants and secret handling;
- complete CI evidence;
- human approval before merge or deployment.

## 8. Cost and safety constraints

Prefer local Supabase CLI/PostgreSQL fixtures and existing GitHub Actions infrastructure. Do not add paid services, create cloud resources, alter secrets, run production migrations, merge, or deploy as part of this phase without separate explicit approval.

## 9. Phase 4N.8C implementation checkpoint

The following repository changes have been committed to `feat/phase-4n8c-workflow-reliability-pr35`:

- Added `supabase/functions/_shared/workflow-actions.mjs` as the single runtime-neutral allowlisted local action dispatcher.
- Added `supabase/functions/_shared/workflow-actions.test.mjs` covering supported actions, invalid configuration, unknown actions, selected text fields, and input immutability.
- Updated both authenticated and cron workers to import the shared dispatcher instead of maintaining duplicate action implementations.
- Updated the Phase 4N.8B workflow to run the new Node regression suite.

**Verification boundary:** repository writes are confirmed by GitHub commit responses. The new Node tests, Deno type checks, application build, and disposable database integration tests have not yet been executed in this session. The CI workflow has not yet been observed running for this branch.

**Not implemented:** retry execution, a new recovery RPC, an outbox table, external integrations, or production migrations. These require additional schema/state-machine design and disposable-database evidence. The current retry gap is intentionally not papered over with unsafe same-generation retries.

## 10. Phase 4N.8C.2 — Pure retry-policy checkpoint

A database-independent policy module is added at `supabase/functions/_shared/workflow-retry-policy.mjs`. It:
- retries only an explicit allowlist of transient error codes;
- treats unknown, validation, and authorization errors as terminal by default;
- defines `retry_limit` as additional retries after the initial execution;
- bounds exponential backoff with full jitter and a maximum elapsed-time budget;
- accepts an injected random source and explicit timestamps for deterministic tests;
- performs no I/O, sleeping, persistence, or worker-side retry loop.

**Integration remains intentionally blocked.** The current schema does not persist an independent step execution attempt, lease token, retry schedule, or atomic retry claim. Do not call this policy from either worker until a reviewed database state model can safely advance a step attempt without weakening run-generation fencing. This checkpoint is policy logic only, not end-to-end retry support.
