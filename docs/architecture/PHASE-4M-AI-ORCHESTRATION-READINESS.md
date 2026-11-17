# Phase 4M — AI Orchestration Readiness and Provider Integration Plan

**Status:** PLAN ONLY — no live provider, backend, credentials, or repository-writing agent is enabled.  
**Base commit:** `e2d6f079fcb2da3ad5f3445d6cd53212b970ca28`  
**Branch:** `phase-4m-ai-orchestration-readiness`  
**Budget default:** USD 0.00; paid providers remain disabled.  
**Change policy:** isolated branch; no merge, deployment, migration, secret mutation, or paid activation.

## 1. Executive decision

Extend the existing provider-neutral AI foundation. Do not create a second orchestrator or an unrestricted multi-agent swarm.

Existing source:
- `src/lib/ai/agent-registry.mjs`
- `src/lib/ai/policy.mjs`
- `src/lib/ai/orchestrator.mjs`
- `tests/ai-orchestration.test.mjs`
- `docs/architecture/PHASE-3D-3-AI-ORCHESTRATION.md`

The current foundation is a useful library scaffold, not a production AI service. The React/Vite application has no verified trusted server execution boundary, live provider configuration, durable audit store, or end-to-end provider test. The source comments explicitly require server-only instantiation; that requirement must be enforced by architecture and CI, not comments alone.

## 2. Evidence and current status

| Capability | Status | Evidence / limitation |
|---|---|---|
| Provider-neutral single-step orchestration | IMPLEMENTED | Existing orchestrator module |
| Agent metadata registry | IMPLEMENTED | Existing registry module |
| Deny-by-default provider/tool policy | IMPLEMENTED | Existing policy module |
| Input/output/step limits | IMPLEMENTED | Policy and orchestration tests |
| Timeout and caller cancellation | IMPLEMENTED | Orchestration tests |
| Metadata-only in-memory audit events | PARTIAL | Bounded memory only; not durable |
| Cryptographic action-scoped approval | NOT IMPLEMENTED | Current verifier is an injected callback |
| Trusted server-side provider calls | NOT VERIFIED | No production server route/runtime confirmed |
| Server-side secret storage | NOT VERIFIED | No provider secret configured or validated |
| Durable audit persistence | NOT IMPLEMENTED | In-memory events only |
| Per-user/workspace quota reservation | NOT IMPLEMENTED | Estimated cost metadata is not billing truth |
| Live provider connectivity | NOT CONFIGURED | No provider is enabled by default |
| Safe repository patch workflow | NOT IMPLEMENTED | No patch sandbox or review pipeline |
| Human-approved release | REQUIRED | Must remain a separate gate |

## 3. Critical trust-boundary requirements

1. All provider calls and privileged tools must execute in a trusted server runtime.
2. Never put provider credentials in `VITE_*` variables, browser storage, client bundles, logs, or source control.
3. Server identity must come from a verified authentication session; never trust a user ID, role, or workspace ID supplied by a model or request body.
4. Every request must enforce workspace membership and role authorization server-side.
5. Provider and tool inputs/outputs must pass runtime schema validation and explicit size limits.
6. Use short-lived, single-action, server-issued approvals for write operations. Bind approvals to actor, workspace, action, target, expiry, nonce, and request digest; reject replay.
7. Persist audit metadata server-side with access controls, retention, redaction, and correlation IDs. Never store raw secrets or unrestricted prompt/output contents by default.
8. Enforce per-user and per-workspace rate limits, concurrency limits, cancellation, idempotency, and budget reservations.
9. Treat provider output as untrusted data. Never execute generated JavaScript, shell, SQL, Git commands, or deployment instructions directly.
10. Browser UI must not be treated as an authorization boundary.

## 4. Important cost-control correction

The current adapter's `estimatedCostUsd` is caller-supplied metadata. It can be useful for a preflight policy check, but it does not prove the actual provider charge and must not be treated as a hard billing ceiling.

Before any hosted provider is enabled:
- Use server-owned model/provider pricing configuration with a timestamp and source.
- Reserve a maximum request budget before dispatch.
- Reconcile provider-reported usage after completion.
- Fail closed when pricing or usage data is missing.
- Set per-user, per-workspace, and global spend limits.
- Keep hosted providers disabled unless an explicit budget is approved.

A zero-dollar estimate does not make a hosted provider free. Free tiers have quotas, changing terms, and possible infrastructure costs.

## 5. Target architecture

```text
React / Vite UI
  |
  | authenticated HTTPS; no provider keys
  v
Trusted API boundary
  |-- session verification
  |-- workspace authorization
  |-- schema validation
  |-- rate / concurrency / budget reservation
  |-- approval verification
  v
AI Application Service
  |-- task planner (bounded)
  |-- agent registry
  |-- policy engine
  |-- provider router
  |-- typed tool registry (deny by default)
  |-- evaluation / safety checks
  v
Provider adapters (disabled by default)
  |-- mock adapter for CI
  |-- optional local/self-hosted adapter
  |-- optional hosted adapter after approval
  v
Audit + usage persistence
  |-- metadata-only events
  |-- usage reconciliation
  |-- retention and access controls
```

Do not select or provision a backend until the existing Supabase project/schema and deployment runtime have been inspected read-only and reconciled with the repository's backend decision.

## 6. Provider strategy and free-first alternatives

| Option | Cost posture | Trade-off | Gate |
|---|---|---|---|
| Mock provider | Free in CI | Tests contracts, not real model quality | Allowed for tests |
| Local/self-hosted model | No per-token API fee may be possible | Hardware, memory, hosting, latency, maintenance | Evaluate device/server capacity first |
| Hosted free tier | May be free within quota | Quotas and terms can change; not unlimited | Verify current terms and privacy |
| Paid hosted API | Variable cost | Often better availability/capability | Disabled until explicit budget approval |

Use provider adapters so the application domain does not depend on one vendor. Do not hardcode provider IDs, model IDs, pricing, or credentials.

## 7. Safe multi-agent evolution

Do not enable a self-modifying autonomous agent. Implement in this order:

1. Mock-only provider contract and deterministic adapter tests.
2. Server-only application service boundary.
3. Read-only planner and reviewer agents with strict schemas.
4. Typed, allowlisted read tools with per-tool timeouts and output caps.
5. Server-issued action-scoped approvals for narrowly scoped writes.
6. Durable task queue with idempotency, bounded retries, concurrency limits, and cancellation.
7. Evaluation harness with synthetic fixtures, adversarial inputs, regression corpus, and scoring thresholds.
8. Optional provider routing based on verified quality, latency, privacy, and cost evidence.
9. Repository patch proposal workflow: produce a diff artifact in an isolated workspace; run tests, security checks, and review; human approves any branch/commit/PR action.
10. Separate release approval for merge, migration, and deployment.

## 8. CI requirements for Phase 4M

Add CI checks only after the implementation plan is approved:
- Node unit tests for registry, policy, orchestrator, adapters, approvals, quotas, and audit redaction.
- Contract tests against mock providers; no live API keys required.
- Import-boundary test preventing server-only modules from entering browser entry points.
- Secret scanning and dependency audit.
- Typecheck, production build, unit tests, and browser accessibility tests.
- Negative tests for missing auth, cross-workspace access, expired/replayed approvals, malformed provider output, oversized payloads, timeouts, cancellation, quota exhaustion, and provider failure.
- No CI workflow should print secrets or provider request payloads.
- Live provider smoke tests, if ever approved, must be opt-in, budget-capped, isolated, and skipped by default.

## 9. Implementation sequence and acceptance gates

### 4M.1 — Architecture and repository boundary
- Inspect package scripts, app imports, backend candidates, environment variable names, and existing API routes.
- Prove the AI modules are not imported into the browser bundle.
- Select a server runtime only after read-only evidence and explicit approval.

**Exit:** documented server boundary and dependency/import graph; no secrets.

### 4M.2 — Server-side policy service
- Move or wrap orchestration in server-only modules.
- Add runtime schemas, trusted identity, workspace authorization, rate limits, and server-side budget reservations.
- Keep all providers disabled.

**Exit:** tests prove unauthenticated and cross-workspace requests fail closed.

### 4M.3 — Provider adapter contracts
- Add mock adapter and typed adapter contract.
- Add optional local/hosted adapter packages only after separate review.
- Keep real provider credentials out of frontend and CI.

**Exit:** deterministic mock tests pass; no live provider is implied.

### 4M.4 — Approval, audit, and quotas
- Implement cryptographic, expiring, one-action approvals.
- Add durable audit/usage records and idempotent budget reservation.
- Add replay and concurrency tests.

**Exit:** security tests and schema review pass; no migration until approved.

### 4M.5 — Agent workflows
- Start with planner/reviewer and read-only tools.
- Add a patch proposal artifact workflow; do not allow direct production self-modification.

**Exit:** evaluation suite passes and human approval is enforced for every write.

### 4M.6 — Audit and release review
- Review privacy, security, accessibility, performance, cost, reliability, and operational rollback.
- Require explicit human approval before merge or deployment.

**Exit:** evidence-backed release checklist; no automatic release.

## 10. Non-goals and hard prohibitions

- No unrestricted AI access to every repository or connected account.
- No secret discovery, exfiltration, or credential printing.
- No direct model-generated shell/SQL/JavaScript execution.
- No autonomous merge, deployment, database migration, branch protection change, or secret mutation.
- No paid service activation or billing changes.
- No claims that every AI provider is connected or free.
- No production readiness claim based solely on passing unit tests.

## 11. Next actions

1. Keep PR #14 open and draft until separately reviewed.
2. Inspect repository import graph and existing backend/API implementation read-only.
3. Reconcile Supabase schema/RLS and server runtime without changing them.
4. Present a concrete implementation manifest with file-level changes and rollback plan.
5. Request approval before implementation that changes backend, authentication, provider integrations, secrets, or database state.

**Decision:** Phase 4M begins with architecture and trust-boundary verification. The safest and most maintainable solution is to harden the existing foundation, not to add a broad autonomous agent swarm.
