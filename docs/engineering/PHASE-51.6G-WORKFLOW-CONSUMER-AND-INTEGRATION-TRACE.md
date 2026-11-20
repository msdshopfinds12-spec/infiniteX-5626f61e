# Phase 51.6G — Workflow Consumer and Integration Trace

**Status:** SOURCE TRACE COMPLETE FOR INSPECTED PHASE 51 BASELINE — no runtime integration changes  
**Inspection date:** 2026-11-20  
**Source baseline:** `feat/phase-51-durable-workflow-engine` at `a67345d7be575cc43fbee6461c1cdfd3f8936134`  
**Design branch:** `feat/phase-51-6d-contract-reconciliation`  
**Related PR:** #69

## 1. Executive result

The repository has a meaningful split between tested workflow domain primitives and the live application/worker path:

- Frontend App authenticates the session but explicitly renders demo-only metrics, agent rows, pipeline rows, and logs. It states that no live backend, agent runtime, pipeline, log stream, or security scan is connected or verified.
- The immutable `createWorkflowRunRequest` helper exists with dedicated unit tests, but the inspected App and PipelineBoard do not import it or call a trusted enqueue endpoint.
- The attempt-ledger and retry-policy modules are pure TypeScript domain logic with tests. They are not a distributed lock, database persistence adapter, worker integration, or durable retry scheduler.
- User and cron Edge Functions execute the legacy `workflow_step_runs` projection and existing run-claim RPCs. They do not persist append-only logical step attempts or enforce `workflow_steps.retry_limit` in the inspected execution loop.
- Existing run generation fencing is important and must be retained during any additive attempt-ledger implementation.

**Conclusion:** workflow foundations are partially implemented, but there is no verified end-to-end product path from authenticated browser request to durable attempt history and live UI projection.

## 2. Consumer/source matrix

| Consumer | Inspected source | Current responsibility | Status |
|---|---|---|---|
| Main dashboard | `src/App.tsx` | Auth-gated shell and demo dashboard | DEMO ONLY |
| Pipeline UI | `src/components/PipelineBoard.tsx` | Static sample pipeline constants | DEMO ONLY |
| Agent/log/metric widgets | `src/components/AgentList.tsx`, `LogStream.tsx`, `MetricCard.tsx` | Sample presentation | DEMO ONLY |
| Workflow request contract | `src/features/workflows/workflow-run-request.ts` | Immutable JSON-only `{workflow_id,input}` request | IMPLEMENTED, NOT WIRED |
| Workflow attempt domain | `src/features/workflows/attempt-ledger.ts` | Immutable attempt invariants and lease/fence domain functions | PURE DOMAIN ONLY |
| Retry policy | `src/features/workflows/retry-policy.ts` | Deterministic retry decisions/backoff | PURE DOMAIN ONLY |
| User worker | `supabase/functions/simula-workflow-worker/index.ts` | JWT-authenticated claim and legacy step execution | LEGACY PERSISTENCE PATH |
| Cron worker | `supabase/functions/simula-workflow-cron-worker/index.ts` | Internal-secret-authenticated claim and legacy step execution | LEGACY PERSISTENCE PATH |
| Shared worker guard | `supabase/functions/_shared/worker-security.mjs` | Request/claim/timeout/payload validation | SHARED GUARDS |
| Generated DB types | `src/lib/supabase/database.types.ts` | Typed schema snapshot | EXISTING SCHEMA ONLY |

## 3. Current browser contract

`createWorkflowRunRequest(workflowId, input?)` returns exactly `workflow_id` and `input`. It normalizes the workflow ID and deep-clones/freezes JSON while rejecting unsupported values and unsafe object shapes.

This is the correct browser-facing shape. Do not use generated `workflow_runs.Insert` directly from UI code: the database Insert type exposes lifecycle fields that must remain server-owned.

Missing integration:
- no inspected workflow feature screen/list/detail;
- no trusted enqueue API adapter;
- no request idempotency key contract at the browser/API boundary;
- no live run-status projection in App;
- no loading, empty, error, cancellation, or retry UI for real runs.

Do not wire browser code directly to service-role operations or allow the browser to choose `owner_id`, `attempt`, `status`, lease data, or internal worker metadata.

## 4. Current worker behavior and critical gaps

Both worker functions:
1. Enforce POST and bounded request bodies.
2. Authenticate separately: user JWT for user worker; internal worker secret verified by RPC for cron worker.
3. Claim a bounded batch using existing claim RPCs.
4. Validate claimed-run and workflow ownership.
5. Read ordered workflow steps.
6. Read/create/update one `workflow_step_runs` row for each run/step.
7. Execute an allowlisted local action with cooperative timeout and bounded JSON.
8. Persist success/failure using the run claim generation predicate.

Critical semantics:
- `workflow_runs.attempt` is the run claim generation.
- The existing `workflow_step_runs.attempt` is set to the same run generation.
- The unique one-row-per-(run_id, step_id) model is a state projection, not append-only retry history.
- Both workers select `retry_limit`, but the inspected execution loops do not use it to schedule retry attempts.
- No durable `next_attempt_at` retry scheduling is present in these worker loops.
- A synchronous action timeout check is cooperative and cannot preempt a blocking synchronous operation.

Do not patch retry by looping the existing worker action and overwriting the current step row. Do not replace the old fencing predicate with a logical retry counter.

## 5. Domain-to-persistence boundary

The Phase 51.6B `attempt-ledger.ts` module explicitly documents that persistence adapters must enforce its predicates atomically. It is not a database implementation.

The logical identities must remain separate:

| Counter/token | Meaning | Must not be conflated with |
|---|---|---|
| Run claim generation | Fences stale run workers | Step retry number |
| Logical step attempt number | One-based execution history per run+step | Queue delivery count |
| Queue delivery count | Number of deliveries/reclaims | Logical side-effect count |
| Lease generation | Monotonic fencing token for lease scope | Run attempt or retry number |

The next persistence layer must enforce:
- unique attempt sequence per run/step;
- stable idempotency identity plus request-fingerprint conflict detection;
- atomic claim and lease-generation advancement;
- conditional terminal transitions;
- immutable terminal history;
- persisted retry due time;
- owner and parent consistency;
- transactional current-state projection updates;
- append-only privileges for normal client/worker roles.

## 6. Recommended safe integration architecture

### A. Browser and trusted enqueue boundary

Browser → authenticated Edge Function/API → validate `WorkflowRunRequest` → derive owner from verified JWT → validate workflow ownership/status → enforce idempotency key/fingerprint → insert run + queue/outbox in one trusted transaction.

The browser never supplies authoritative owner or lifecycle state.

### B. Worker claim and attempt lifecycle

Trusted claim RPC → atomically claim due work → advance lease generation → create or recover the correct logical attempt → execute only allowlisted action → conditionally persist result against active lease → update current-state projection in the same transaction where possible.

A retry is a new attempt row with a persisted due time. It is not a repeated update of the prior terminal attempt.

### C. UI read projection

Authenticated read adapter → RLS-scoped run list/detail and safe step projection → UI states:
- loading;
- empty;
- queued/running/retry-wait;
- succeeded/failed/cancelled;
- stale/recovering;
- permission/network error.

Do not expose service secrets, lease credentials, key hashes, raw exception stacks, or internal worker metadata.

### D. Event/log projection

Use correlation IDs and normalized event codes. Treat logs as observability, not authoritative attempt state. A log insertion failure must not turn a successfully committed attempt into a failed execution.

## 7. Implementation sequence

1. Freeze API request/response DTOs and enqueue idempotency semantics.
2. Review exact claim RPC SQL and EXECUTE grants from recovered migration history and the live catalog evidence.
3. Finalize D1–D10 persistence decisions and unresolved FK/delete/retention/cancellation questions.
4. Rehearse the 19 recovered migrations in a disposable PostgreSQL 17/Supabase environment.
5. Validate catalog parity and capture exact local test evidence.
6. Build attempt-ledger tables/RPCs only in a separate disposable candidate migration.
7. Add independent-session concurrency, duplicate-delivery, stale-worker, crash-recovery, cancellation-race, and owner-isolation tests.
8. Integrate user and cron workers behind a compatibility adapter, preserving current run-generation fences.
9. Add trusted enqueue API and authenticated workflow UI.
10. Add live read projections and safe status/log views.
11. Run full CI and isolated integration suites.
12. Only after human approval, plan production migration/deployment separately.

## 8. Alternative paths and decision

**Preferred:** additive attempt ledger + transactional RPC + legacy projection adapter. This preserves current consumers while adding history safely.

**Fallback:** keep the legacy workflow execution path and ship a read-only workflow status UI only after the existing API/read contracts are verified. Do not pretend retry is durable.

**Not recommended:** rewrite both workers and schema simultaneously; reuse `workflow_step_runs` as history; direct browser table writes; client-supplied owner; application-only locking; or unbounded automatic retries.

## 9. Acceptance gates

| Gate | Status |
|---|---|
| Dashboard demo status confirmed from source | VERIFIED |
| Pipeline board is static local constants | VERIFIED |
| Immutable request helper and unit tests exist | VERIFIED |
| Request helper wired to UI/enqueue | NOT IMPLEMENTED in inspected source |
| Pure attempt/retry domain exists | VERIFIED |
| Domain module backed by transactional persistence | NOT IMPLEMENTED |
| User worker uses legacy projection | VERIFIED |
| Cron worker uses legacy projection | VERIFIED |
| Worker enforces retry_limit/durable next-attempt schedule | NOT IMPLEMENTED in inspected source |
| End-to-end UI → enqueue → worker → durable attempt → UI | NOT IMPLEMENTED / NOT VERIFIED |
| Live integration tests | NOT TESTED |
| Production migration/deployment | NOT AUTHORIZED |

## 10. Evidence and safety boundary

This is a source inspection of the named Phase 51 baseline, not a fresh runtime test or production schema query. No worker code, UI code, database schema, grants, RLS, secrets, deployed functions, or production data were changed. No migration or deployment was performed.
