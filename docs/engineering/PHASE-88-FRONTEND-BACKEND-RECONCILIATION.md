# Phase 88 — Canonical Frontend / Backend Reconciliation

**Status:** Draft engineering baseline; documentation-only change  
**Source snapshot:** `6d44000830b28526a5f836543333a6ee11bff4cb`  
**Base:** `fix/workflow-completion-exact-one-row`  
**Production database changes:** NONE  
**Deployment / merge / provider credentials:** NOT AUTHORIZED  
**External provider calls:** NOT VERIFIED / NOT ENABLED BY THIS DOCUMENT

## 1. Purpose

Establish a single evidence-backed implementation baseline for InfiniteX before adding features or changing production infrastructure. This phase intentionally prefers the existing React + Supabase architecture over a backend rewrite.

This document distinguishes:
- **VERIFIED IN SOURCE:** directly observed in the source snapshot.
- **CI VERIFIED:** an exact-head workflow/test result exists for the named commit.
- **PARTIAL:** implementation exists but end-to-end behavior or environment parity is not established.
- **NOT VERIFIED:** source or test evidence is insufficient.
- **BLOCKED:** a required release condition is unavailable or failed.

A source implementation is not proof of a deployed production capability.

## 2. Source snapshot and observed foundations

The audit inspected these paths at the source snapshot above:

| Area | Source evidence | Status |
|---|---|---|
| React application | `src/App.tsx`, `src/main.tsx` | Source exists |
| Authentication lifecycle | `src/features/auth/auth-session-provider.tsx`, auth coordinator/state/actions | VERIFIED IN SOURCE |
| Workflow request validation | `src/features/workflows/workflow-run-request.ts` | VERIFIED IN SOURCE |
| Workflow enqueue browser adapter | `src/features/workflows/workflow-run-service.ts` | VERIFIED IN SOURCE |
| Workflow enqueue Edge Function | `supabase/functions/simula-workflow-run-request/index.ts` | VERIFIED IN SOURCE |
| Workflow read/history/log UI | `src/features/workflows/workflow-read-service.ts`, `workflow-run-history.tsx`, `workflow-log-list.tsx` | VERIFIED IN SOURCE |
| API-key browser adapter | `src/features/security/api-key-service.ts` | VERIFIED IN SOURCE |
| Worker authentication and budgets | `supabase/functions/_shared/worker-security.mjs`, `worker-auth-boundary.mjs` | VERIFIED IN SOURCE |
| Shared deterministic actions | `supabase/functions/_shared/workflow-actions.mjs` | VERIFIED IN SOURCE |
| Shared worker completion | `supabase/functions/_shared/workflow-completion.ts` | VERIFIED IN SOURCE |
| Transactional outbox migration | `supabase/migrations/20261121000200_simula_transactional_workflow_outbox.sql` | Candidate migration; NOT production-applied |
| Outbox lease ambiguity correction | `supabase/migrations/20261121000300_fix_ambiguous_outbox_lease_expiry.sql` | Candidate migration; NOT production-applied |
| Disposable outbox integration | `tests/workers/phase-87-outbox-integration.deno.ts` | CI VERIFIED on recorded PR #125 head |
| Worker runtime parity | `tests/workers/worker-runtime-parity.test.mjs` | Test source exists |

The package scripts include TypeScript build/lint, Node test suites, worker tests, Edge Function security tests, runtime parity tests, and API-key contract tests. See `package.json` for the authoritative commands.

## 3. Important behavior contracts already present

### 3.1 Authentication

The React session provider subscribes to auth-state events before requesting the initial session. The coordinator fences late initial results so an older session read does not overwrite a newer auth event.

The Edge Function enqueue boundary extracts a bearer token, validates it with Supabase Auth `getUser`, and derives the owner identity from the verified user. The browser must not be trusted to supply an authoritative owner ID.

### 3.2 Workflow enqueue

The browser adapter:
- validates workflow and request UUIDs;
- invokes `simula-workflow-run-request`;
- validates the response shape;
- returns a queued result only when the response contract matches.

The queue form explicitly tells the user that queueing does not prove worker execution. It retries an uncertain request using the same request ID and input to preserve idempotency.

The browser feature is deployment-gated and disabled unless the relevant environment flag is explicitly enabled. Do not enable it until the matching database migration, Edge Function, and environment configuration have been verified together.

### 3.3 Input and execution boundaries

Workflow request input is cloned and frozen as JSON-only data. It rejects unsupported values, circular references, non-finite numbers, sparse arrays, accessors and non-plain objects.

Worker security helpers provide bounded JSON parsing, batch limits, attempt-generation checks, timeout validation and retry controls. The shared action executor currently supports deterministic local transformations such as pass-through, setting/merging JSON fields, and string case/prefix/suffix transformations.

**Do not describe those deterministic transformations as a live AI model integration.** A real AI provider capability requires an explicit provider adapter, server-side credential handling, request/response validation, cost limits, timeout/cancellation, idempotency/reconciliation and integration tests.

### 3.4 Outbox delivery semantics

The outbox design documents at-least-once delivery, stable idempotency keys, lease tokens, bounded retries and dead-letter behavior. At-least-once is not exactly-once. A provider call may succeed while the dispatcher loses its response; provider idempotency or reconciliation is required to prevent duplicate side effects.

The current Phase 81 evidence is disposable PostgreSQL/PostgREST CI evidence. It is not evidence that the candidate migration has been applied to a live or production database.

## 4. Documentation reconciliation findings

Older design documents must be reconciled against the later source snapshot before anyone uses them as implementation status.

In particular:
- `docs/engineering/PHASE-87-2-WORKER-INTEGRATION-AND-DRY-RUN-DISPATCHER.md` describes a state where workers still use direct completion updates and the outbox is not integrated into their completion path.
- The later Phase 87.4 source snapshot includes a shared completion helper and both worker entry points import/call it. The exact-head Phase 81 outbox integration test passed in disposable CI on the recorded PR #125 head.
- Therefore, the older Phase 87.2 document must be treated as historical design context, not the current source-of-truth for worker completion.

Do not rewrite or delete historical documents in this documentation-only phase. A subsequent change should add a dated supersession note or update a canonical status index after checking all relevant commits and CI evidence.

## 5. Critical remaining gaps

| Priority | Gap | Evidence required to close |
|---|---|---|
| P0 | Candidate migration vs deployed schema parity | Read-only schema/function/privilege comparison in the intended environment; no live migration without separate approval |
| P0 | PR #124 / #125 stacked dependency and review sequence | Exact branch ancestry, merge-base, required checks and human review reconciliation |
| P0 | Vercel status failure due daily deployment quota | Fresh status after quota reset; do not repeatedly trigger deploys |
| P1 | Full outbox dispatch lifecycle | Identify actual dispatcher entry point, prove lease claim → allowlisted adapter → finish RPC, and test no duplicate side effects |
| P1 | Actual AI provider execution | One provider adapter, server-side secret binding, synthetic test account/data, bounded usage and persisted result |
| P1 | UI completion states | Verify queued/running/succeeded/failed/superseded/dead states against actual persisted records |
| P1 | Tenant isolation | Exact-head PostgREST/RLS integration plus server-side authorization review |
| P1 | Logging privacy | Verify error sanitization, payload redaction and absence of credentials/PII in logs |
| P2 | Dashboard metrics | Replace sample metrics only with traceable persisted/monitoring sources |
| P2 | Responsive/accessibility QA | Browser/viewport checks, keyboard flow, labels, focus and screen-reader semantics |
| P2 | Build artifact policy | Determine whether committed `dist/` is intentional before changing ignore/build/deploy configuration |

## 6. Recommended implementation strategy

Use the smallest vertical slice rather than a broad rewrite:

1. Keep PR #124 and #125 draft and preserve their existing commits.
2. Reconcile their ancestry and review requirements before merge planning.
3. Confirm the actual outbox dispatcher implementation and whether it is reachable from a scheduled/authorized entry point.
4. Build one synthetic workflow using only an allowlisted deterministic action.
5. Verify authenticated enqueue → persisted queued run → worker claim → step completion → persisted result → run history UI.
6. Only after that passes, add one AI provider adapter behind a server-side interface and feature gate.
7. Add real metrics and additional providers only after their underlying data and cost controls are verified.

Preferred architecture:
- React UI: presentation and typed service adapters only.
- Supabase Auth: identity.
- Edge Functions: authenticated command boundary.
- PostgreSQL/RLS/RPC: authoritative state and atomic transitions.
- Workers: bounded execution with lease/attempt fencing.
- Outbox: durable intent with at-least-once delivery semantics.
- Provider registry: closed allowlist of server-side adapters.
- Observability: sanitized events and traceable persisted metrics.

Avoid browser-side provider secrets, arbitrary URL execution, arbitrary code from workflow configuration, unbounded retries, false exactly-once claims, disabling CI gates, or rebuilding the existing backend without evidence.

## 7. Verification plan

Run against the exact proposed head, using the repository's lockfile and CI environment:

1. `npm ci`
2. `npm run lint`
3. `npm test`
4. `npm run test:edge-function-security`
5. `npm run test:worker-runtime-parity`
6. `npm run test:workers`
7. `npm run build`
8. Phase 81 disposable PostgreSQL/PostgREST integration.
9. Phase 82 tenant-isolation integration.
10. Phase 84 enqueue integration.
11. Phase 86 Deno/runtime parity verification.

These commands are a plan, not a claim that they ran on this documentation-only branch. Exact-head CI must supply the result.

## 8. Release and safety gates

- PLAN: source snapshot, dependencies and change scope are explicit.
- BUILD: only reviewed, scoped changes on a dedicated branch.
- TEST: actual exact-head CI results, not inferred success.
- AUDIT: security, privacy, RLS, migrations, worker behavior and UI states.
- RELEASE: separate human approval required.

This branch/document does not authorize:
- production database migrations or data changes;
- deployment or Vercel quota/billing changes;
- secrets or environment variable changes;
- merges, branch protection changes or disabling checks;
- external provider calls or paid usage;
- deletion or rewriting of historical migrations, branches, or PRs.

## 9. Definition of done for Phase 88

Phase 88 is complete only when:
- the canonical status index accurately references current source and exact-head CI evidence;
- historical docs are explicitly marked as historical or superseded without deleting provenance;
- outbox dispatcher ownership and runtime entry point are verified;
- one synthetic end-to-end workflow passes on a disposable environment;
- the UI displays persisted states without presenting queue acceptance as execution success;
- tenant isolation and log sanitization have passing evidence;
- unresolved production parity and deployment blockers are clearly recorded.

**Current conclusion:** InfiniteX has a substantial frontend, authentication, workflow enqueue, worker-security and transactional-completion foundation. It is not yet verified as a complete live AI-agent platform. The fastest safe path is to finish and prove one vertical workflow, then generalize.
