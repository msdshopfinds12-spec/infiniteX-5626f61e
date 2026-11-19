# InfiniteX Unified Reliability Foundation

**Status:** Proposed engineering contract; documentation only  
**Baseline:** `main` at `4538bd0cceb3d2ee6adbaf36777047108229cf3c`  
**Scope:** Architecture guidance for review. This document does not authorize schema migrations, production changes, merges, or deployment.

## 1. Goals

1. Preserve a single authoritative workflow execution model.
2. Prevent stale workers from overwriting newer execution generations.
3. Make retry scheduling durable, bounded, observable, and safe for side effects.
4. Separate authenticated identity, authorization, orchestration, and execution.
5. Reuse PostgreSQL integration-testing techniques without importing an unrelated schema.
6. Ensure the UI never represents demo data as verified live telemetry.

## 2. Non-goals

- Replacing the current frontend framework.
- Declaring Supabase or any other backend as production-connected.
- Treating the Phase 6G test harness schema as the Phase 4N production schema.
- Guaranteeing exactly-once execution of arbitrary external side effects.
- Enabling autonomous agents to bypass human approval or server-side authorization.

## 3. Logical architecture

```text
React / TypeScript Command Center
             |
             v
Authenticated API Boundary
             |
             v
Identity + Tenant Authorization
             |
             v
Workflow Orchestrator
             |
             +---- Policy / Approval Gate
             |
             v
Transactional Queue + Attempt Ledger
             |
             v
Fenced Worker Execution Boundary
             |
             v
Allowlisted, Idempotent Adapters
             |
             v
Transactional Settlement + Audit Events
```

The database is authoritative for durable workflow state. Workers are untrusted with respect to ownership and generation: every state transition must be checked atomically by the database boundary. Agents may propose plans and structured actions; only the authorized orchestrator may schedule execution.

## 4. Reliability invariants

- **I1 — Ownership:** every read or mutation is scoped to the authenticated owner/tenant using verified server-side identity.
- **I2 — Generation fence:** a worker may mutate a run only when its run generation still matches the current parent generation.
- **I3 — Atomic claim:** no two workers may hold the same active attempt lease.
- **I4 — Single terminal transition:** each attempt has at most one accepted terminal outcome.
- **I5 — Bounded retry:** attempts are bounded by policy, elapsed-time budget, and operation safety classification.
- **I6 — Side-effect safety:** retrying an external action requires downstream idempotency or a reconciliation strategy.
- **I7 — Fail closed:** unknown schema, identity, state, or error classifications cannot grant execution.
- **I8 — Auditability:** state transitions record actor, operation, generation, outcome, and correlation identifiers without secrets.
- **I9 — Human approval:** destructive, externally visible, financial, credential, or release actions require explicit policy and approval.
- **I10 — Truthful telemetry:** demo fixtures and unverified integrations are visibly labeled.

## 5. Component responsibilities

| Component | Responsibility | Must not do |
|---|---|---|
| UI | Display state, collect intent, show evidence | Claim server success from optimistic UI alone |
| API | Validate payload, authenticate caller, enforce request limits | Trust client-supplied owner IDs |
| Orchestrator | Plan and schedule permitted work | Bypass policy or database fencing |
| Queue/ledger | Persist attempt lifecycle and leases | Infer success from worker disappearance |
| Worker | Execute one claimed attempt | Self-assign ownership or ignore lease expiry |
| Adapter | Perform allowlisted integration with idempotency | Accept arbitrary URLs, commands, or credentials |
| Database RPC | Atomically validate and transition state | Expose service-only functions to public roles |
| Audit stream | Record security-relevant transitions | Store tokens, passwords, or raw secrets |

## 6. Failure model

Handle process crashes, duplicate delivery, delayed messages, lost claim responses, expired leases, concurrent cancellation, transient provider errors, permanent validation errors, network partitions, and ambiguous external outcomes.

An ambiguous external outcome is not automatically retryable. Mark it `outcome_unknown`, then reconcile using the provider's idempotency/status API or require human review.

## 7. Implementation sequence

1. Recover authoritative schema and migration provenance.
2. Map all writers/readers, RPCs, triggers, policies, and scheduled jobs.
3. Approve a versioned database contract.
4. Implement disposable PostgreSQL integration tests.
5. Implement attempt persistence and fencing behind server-only APIs.
6. Add provider adapter idempotency and reconciliation.
7. Replace mock operational indicators with explicit demo/live states.
8. Run build, unit, integration, security, and concurrency suites.
9. Conduct independent review and obtain release approval.

## 8. Verification status

| Area | Status |
|---|---|
| Architecture proposal | Documented |
| Authoritative Phase 4N schema | Not verified |
| Production database integration | Not verified |
| Durable retry implementation | Not verified |
| Exactly-once external effects | Not guaranteed |
| Release approval | Not granted |

## 9. Change control

Any schema, worker, API, security-policy, or deployment change requires a separate reviewed implementation plan. Never apply SQL based solely on illustrative field names in architecture documents.
