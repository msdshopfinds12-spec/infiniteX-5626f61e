# Phase 51 — Implementation Plan and Engineering Gates

## Outcome
Deliver a durable, secure workflow execution engine without destabilizing the existing InfiniteX application.

## Work packages

### WP1 — Baseline and contract
- Freeze current worker API and status contracts.
- Map every current workflow_runs and workflow_step_runs state transition.
- Identify all frontend and worker writes to lifecycle fields.
- Record current queue claim RPCs, constraints, indexes, and grants.
- Add failing regression tests for retry_limit no-op and timeout mismatch.

**Exit:** reviewed contract inventory and reproducible tests.

### WP2 — Data model proposal
- Propose step attempt history and durable lease model.
- Confirm FK targets, RLS, grants, retention, and deletion behavior.
- Inventory existing timeout values above proposed cap.
- Prepare forward and rollback SQL files for review only.

**Exit:** migration design reviewed; no production apply.

### WP3 — Pure domain implementation
- Implement retry classification, backoff, transition validation, timeout policy and idempotency-key helpers as pure TypeScript modules.
- Inject clock and randomness for deterministic tests.
- Do not connect pure modules to production worker paths until tests pass.

**Exit:** unit tests pass and boundary cases are covered.

### WP4 — Persistence adapter
- Implement transactional claim/transition operations against an isolated database.
- Use compare-and-set and lease token/generation fencing.
- Enforce owner scope on every operation.
- Ensure side-effect idempotency before retrying external actions.

**Exit:** isolated integration and concurrency tests pass.

### WP5 — Worker orchestration
- Integrate bounded concurrency, heartbeats, retry scheduling, recovery and cancellation.
- Keep synchronous actions within a conservative time budget.
- Route long-running work through async job contracts.

**Exit:** crash/replay and duplicate-delivery suites pass.

### WP6 — UI and observability
- Add mobile-first run timeline, attempt history, queued/running/retrying/failed states, safe error messages and retry visibility.
- Add correlation IDs, queue age, retry counts, lease expiry and normalized failure metrics.
- Do not expose internal stack traces, lease tokens, key hashes, or provider secrets.

**Exit:** responsive accessibility and error-state QA passes.

### WP7 — Security and release
- Run Owner A/B isolation tests with synthetic identities.
- Review RLS, grants, service-role usage, worker-secret verification and CORS.
- Run dependency audit, lint, unit, integration, build and Deno checks.
- Exercise rollback in isolated environment.
- Obtain explicit approval before production migration/deployment.

**Exit:** release evidence and human approval recorded.

## Critical path
WP1 → WP2 → WP3 → WP4 → WP5 → WP6 → WP7

WP3 can begin in parallel with WP2 after WP1 has frozen the contracts. Do not skip WP1.

## Status definitions
- VERIFIED: directly supported by executed test or inspected source/schema evidence.
- PARTIAL: implemented but missing required integration or adversarial evidence.
- BLOCKED: requires missing schema/product decision/approval.
- NOT TESTED: no execution evidence.

## Explicit approvals still required
Production schema migration, GRANT/REVOKE, RLS changes, data mutation, Edge Function deployment, Vercel deployment, secret changes, billing, merge, and release each require separate explicit approval.
