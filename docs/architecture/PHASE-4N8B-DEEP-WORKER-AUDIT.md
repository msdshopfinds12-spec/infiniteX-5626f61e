# Phase 4N.8B deep worker audit

Date: 2026-11-20
Scope: candidate branch `audit/phase-4n8b-live-schema-preflight`; read-only source inspection.

## Executive summary

The candidate transactional step RPC is integrated in both Edge Functions, and static inspection found no direct REST mutations to `workflow_step_runs` in either worker. This closes an important source-level stale-step-write path in the candidate implementation, provided all competing claim/recovery paths serialize on the same parent `workflow_runs` row.

This is not production parity. The live database previously inspected does not contain the RPC, and deployed worker source hashes differ from the candidate.

Two further functional limitations are explicit in the candidate source and must not be marketed as fully implemented features:

1. Step timeouts are cooperative checks around synchronous actions. They cannot preempt a blocked JavaScript isolate.
2. `retry_limit` is loaded from the database but is not used to retry an action. A step failure currently fails the workflow run.

The candidate action registry is a small deterministic JSON/text transformation engine. It is not an LLM, external tool, browser, code-execution, or multi-agent runtime.

## Exact source reviewed

- `supabase/migrations/20261120000000_phase_4n8b_transactional_step_fencing.sql`
- `supabase/functions/simula-workflow-worker/index.ts`
- `supabase/functions/simula-workflow-cron-worker/index.ts`
- `supabase/functions/_shared/worker-security.mjs`
- `supabase/tests/phase-4n8b-live-schema-preflight.sql`

## Findings

### F-01 — Candidate step writes use transactional RPC

Severity: high impact / mitigation present in candidate

Both workers call `simula_transition_workflow_step` for start, succeed and fail transitions. Static source inspection found no `.insert()`, `.update()`, `.upsert()`, or `.delete()` against `workflow_step_runs` in either worker.

The SQL function locks the parent `workflow_runs` row with `FOR UPDATE`, checks owner, running status and attempt generation, validates workflow/step membership, then changes the step row in the same transaction. Execute is revoked from public/anon/authenticated and granted to service_role.

Remaining condition: every claim, recovery, retry, cancel, timeout and administrative mutation of the parent run must be audited for compatible row-lock ordering. The RPC alone cannot protect against an alternate path that mutates child state directly.

### F-02 — Step timeout is not a hard execution timeout

Severity: high

`executeWithinStepBudget` records a monotonic deadline and checks it before and after calling the action. Its own source comment explicitly says it cannot preempt a synchronous function that blocks the JavaScript isolate.

Current registered actions are synchronous JSON/text transformations, which limits present exposure. However, this helper must not be reused as a hard timeout for future LLM calls, network I/O, subprocess-like work, or arbitrary user code.

Recommended safe architecture:
- run external/long work as a separately leased job;
- use AbortSignal/cancellable I/O where the provider supports cancellation;
- enforce a database lease/deadline and generation fence independently of client cancellation;
- bound response size, provider time, retries and total workflow budget;
- treat timed-out remote work as potentially still executing until its result is fenced out.

Do not describe the current timeout helper as hard preemption.

### F-03 — retry_limit is not enforced by either worker

Severity: high functional gap

Both workers select `retry_limit` into the Step type but do not read it in the execution loop. Any action error transitions the step to failed and then marks the run failed. There is no bounded retry/backoff loop in the reviewed worker source.

Decision required before implementation:
- define whether retry_limit means retries after the first attempt or total attempts;
- define retryable vs permanent error classes;
- persist retry scheduling/next_attempt_at and attempt accounting;
- use bounded exponential backoff with jitter and a maximum workflow budget;
- ensure a retry does not let a stale worker write into a newer run generation;
- distinguish step execution attempt from parent run claim generation if they have different lifecycles.

Do not silently reinterpret the existing column semantics.

### F-04 — Current action registry is deterministic, not an AI runtime

Severity: medium / product capability boundary

The reviewed workers support `pass_through`, `set_value`, `merge_json`, uppercase/lowercase and append/prepend text operations. Unsupported action types fail closed.

There is no evidence in these files of an LLM provider, model router, browser, search connector, external tool invocation, Python runtime, or agent-to-agent orchestration. The UI and API must label these capabilities accurately until a reviewed server-side adapter is implemented.

### F-05 — Live production parity remains absent

Severity: release blocker

Previously recorded live catalog inspection returned:
- workflow tables present;
- unique run/step identity present;
- `public.simula_transition_workflow_step` absent;
- deployed worker source hashes different from this candidate.

No migration or Edge Function deployment has been performed. The candidate SQL must not be applied until exact schema, constraints, ownership, grants and all claim/recovery writers are verified against the live PostgreSQL 17 schema.

### F-06 — Retry, timeout, cancellation and recovery are not a single tested lifecycle

Severity: high

Current candidate tests cover core generation fencing, but a production-ready lifecycle test suite must include:
- duplicate same-generation start;
- stale start/succeed/fail after a newer generation claims the run;
- parent-row lock contention across independent PostgreSQL sessions;
- claim vs stale recovery race;
- timeout vs successful completion race;
- retry scheduling vs new claim;
- cancellation vs active step completion;
- duplicate cron invocation;
- worker crash after side effect but before persistence;
- idempotency behavior for any external side effect.

Use a disposable PostgreSQL 17/Supabase environment only. Never run mutating tests against production.

## Alternative implementation strategies

### Option A — Minimal safe completion (recommended first)

Keep current deterministic action registry. Implement correct retry semantics and a durable timeout/lease lifecycle in the database/worker boundary. Add PostgreSQL 17 concurrency and failure-injection tests. This is the lowest-cost path and avoids introducing an unverified AI dependency.

### Option B — Provider-backed AI actions

Add a server-only provider adapter behind a registered action catalog. The backend must own provider credentials, model selection, tenant budgets, request limits, redaction, approval rules and audit events. Provider calls need cancellation where supported plus a lease/generation fence because cancellation is not proof that remote work stopped.

### Option C — IQ Core adapter

Keep IQ Core isolated from the React browser bundle. Add a pinned server-side adapter with explicit tool allowlists and durable PostgreSQL run state. Require license/provenance, dependency, source-security, tenant isolation and exact-head test evidence before importing runtime code.

## Required next implementation gates

1. Inventory every SQL function and Edge Function that mutates `workflow_runs.attempt/status` or `workflow_step_runs`.
2. Verify all writers serialize on the same parent run row and never bypass transactional child transitions.
3. Decide and document retry_limit semantics before writing retry code.
4. Replace misleading hard-timeout assumptions with a lease + cancellation + generation-fencing design.
5. Build a PostgreSQL 17 disposable fixture from authoritative migrations.
6. Test concurrency and failure recovery across independent sessions.
7. Re-run exact-head Deno/Node tests, type checks and application build.
8. Perform a separate security review and obtain human approval before any production migration or deployment.

## Evidence ledger

| Claim | Status |
|---|---|
| Both candidate workers use transactional step RPC | VERIFIED by exact source |
| No direct candidate REST writes to step-run table in either worker | VERIFIED by static source scan |
| RPC uses parent-row lock and generation checks | VERIFIED by SQL source |
| RPC service_role-only EXECUTE intent | VERIFIED by SQL source; live ACL not installed |
| Current timeout preempts blocked synchronous code | FALSE; helper explicitly cannot preempt |
| retry_limit is enforced | NOT IMPLEMENTED in reviewed worker source |
| AI provider / multi-agent runtime exists in these workers | NOT EVIDENCED |
| Live database has candidate RPC | NOT VERIFIED; previous live catalog check returned absent |
| PostgreSQL 17 full lifecycle concurrency tests | NOT TESTED |
| Production migration/deployment | NOT AUTHORIZED |


### F-07 — Candidate branch does not contain the authoritative historical migration chain

Severity: release blocker

A recursive tree inspection of the candidate branch found only one tracked SQL migration under `supabase/migrations/`: the Phase 4N.8B transactional step-fencing candidate. The live Supabase project previously reported 19 migration-ledger entries, but their original SQL bodies are not present in this branch's migration directory.

This means the candidate branch is not a reproducible database bootstrap source. Do not treat the candidate migration as a complete schema history, and do not run `supabase db reset` or attempt a production migration from this branch.

Required recovery:
- export/recover the exact historical migration SQL from the authoritative source repository, backup or controlled Supabase migration history;
- map every live ledger version to an immutable source file and checksum;
- compare the reconstructed chain to the live catalog (tables, constraints, functions, grants, extensions and policies);
- resolve any drift explicitly and preserve a baseline snapshot;
- only then run clean-room PostgreSQL 17/Supabase bootstrap and migration tests.

Until this is complete, local full-stack schema reproducibility is BLOCKED even though the live database itself is active.
