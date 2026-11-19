# Phase 4N.9 — Repository Integration Manifest

**Status:** PROPOSED INTEGRATION CONTROL DOCUMENT  
**Snapshot date:** 2026-11-20  
**Repository:** `msdshopfinds12-spec/infiniteX-5626f61e`  
**Parent architecture baseline:** PR #37, commit `88100b2c34c8a5c600e26e6bad2c8338f019073a`  
**Scope:** Read-only inventory synthesis and integration planning; no runtime or database changes.

> This document is a planning artifact. A branch name, PR title, source file, or green CI run is not proof that a feature is production-ready. Re-verify every head SHA, base SHA, check, and dependency before integration.

## 1. Executive decision

Do not merge the repository's open PRs or development branches as a batch.

The inspected repository snapshot contains **82 branches** and **36 open pull requests**. The work is distributed across several independent branch lineages. Integrate by capability and dependency, not by branch age, PR number, or ambitious feature title.

The safest near-term strategy is:

1. Preserve all existing work; do not delete or force-update branches.
2. Establish one reviewed integration baseline.
3. Keep the existing frontend foundation isolated from unverified backend work.
4. Recover authoritative database/API contracts before accepting workflow migrations.
5. Integrate small, reviewable vertical slices with exact-head CI and isolated tests.
6. Keep merge, production migration, secret changes, billing, and deployment behind explicit human approval.

## 2. Repository topology snapshot

The branch listing returned 82 branches and the open-PR listing returned 36 open PRs at inspection time.

This is a topology snapshot, not a complete code-quality ranking. Branch names are discovery hints only. Branches without a reviewed PR, verified base, or current CI evidence remain **UNASSESSED**.

### 2.1 Known active integration candidates

| Workstream | Reference | Observed relationship | Initial disposition |
|---|---|---|---|
| Mobile frontend foundation | PR #43, `fix/infinitex-mobile-nav-a11y-qa-foundation` | Base: `fix/infinitex-final-foundation-demo-integration` | Keep isolated; verify exact-head CI and later browser behavior |
| Transactional step fencing | PR #35, `fix/phase-4n8b-transactional-step-fencing-impl` | Base: `fix/phase-4n8b-transactional-step-fencing` | Block migration integration pending schema provenance and disposable-DB tests |
| Master architecture blueprint | PR #37, `docs/phase-4n8c-master-architecture-blueprint` | Base: `feat/phase-4n8c-workflow-reliability-pr35` | Documentation baseline only; not an implementation integration point |
| Workflow reliability | `feat/phase-4n8c-workflow-reliability`, `feat/phase-4n8c-workflow-reliability-pr35` | Multiple related branch names exist | Compare commits and migrations before selecting a canonical lineage |
| AI gateway | `feat/infiniteX-phase-3-ai-gateway` | Separate feature branch | Inspect provider adapters, secrets boundary, quotas, tests, and backend ownership |
| Agent adapters | `feat/infiniteX-phase-3b-agent-adapters` | Separate feature branch | Inspect capability allowlists and execution boundary before integration |
| Orchestration | `feat/phase-3d3-ai-orchestration-foundation` | Separate feature branch | Treat as proposal until durable execution and permission boundaries are proven |
| Trusted backend | `feat/phase-3d4-trusted-backend` | Separate feature branch | Reconcile against deployed functions, schema, RLS, and grants |

The above list is intentionally limited to candidates actually identified during this inspection. It is not a declaration that the remaining branches are obsolete.

## 3. Source-of-truth policy

Until the backend decision is evidence-backed:

- The current React/Vite application is the frontend foundation candidate, not proof of a complete product.
- Supabase is a candidate backend, not yet a verified canonical backend for all application domains.
- Existing Edge Functions and standalone API code must not both own the same business transition.
- The deployed database schema, deployed Edge Function versions, RLS, grants, triggers, and scheduled jobs must be inventoried read-only before schema changes.
- The browser must never receive service-role keys, provider secrets, or privileged integration credentials.
- Demo/static data must remain visibly identified as demo data.

Create an Architecture Decision Record (ADR) for the canonical backend only after the deployed state and repository state have been reconciled.

## 4. Dependency-aware integration sequence

### Gate 0 — Freeze the evidence baseline

For every candidate PR, record:

- PR number and URL
- head branch and exact head SHA
- base branch and exact base SHA
- merge-base SHA and ahead/behind counts
- changed-file list and overlap with other candidate PRs
- required CI checks at the exact head SHA
- migration/function/schema dependencies
- secrets and environment assumptions
- test commands and whether they were actually executed
- rollback or revert strategy

A stale green check on an earlier commit does not satisfy this gate.

### Gate 1 — Frontend foundation

Candidate: PR #43 and its declared foundation base.

Acceptance criteria:

- Exact-head install, typecheck, regression test, and production build pass.
- Browser-level navigation works at narrow and wide viewport sizes.
- Keyboard-only navigation and visible focus are verified.
- Screen-reader labels and current-page semantics are checked with an assistive-technology test plan.
- Reduced-motion behavior is manually or automatically checked.
- Demo data and disabled controls are truthfully labeled.
- No backend integration is implied by a successful frontend build.

### Gate 2 — Backend contract recovery

Before integrating a database-dependent feature, recover:

- complete migration history and ordering
- canonical definitions of all referenced tables and columns
- primary keys, foreign keys, unique constraints, and check constraints
- RLS enablement and every policy
- table/function grants and execution roles
- triggers and security-definer functions
- all writers for workflow status, attempts, leases, queues, cancellation, and recovery
- deployed Edge Function versions and scheduled jobs
- local/disposable test fixtures

Required output: a schema provenance report and a reviewed backend ADR.

### Gate 3 — Workflow reliability and transactional fencing

Candidate: PR #35 plus its parent/related workflow branches.

Do not apply its migration to a shared or production database during discovery.

Acceptance criteria:

- Every state-changing writer is enumerated.
- All writers use compatible transactional locking and attempt-generation checks.
- A stale worker cannot settle a newer attempt.
- Duplicate starts and duplicate terminal transitions are rejected or idempotently handled.
- Lease expiry, recovery, cancellation, retries, and terminal states have explicit invariants.
- Concurrency tests run against a disposable database with deterministic fixtures.
- Least-privilege grants and RLS behavior are tested.
- Migration applies cleanly from the verified base schema and has a documented rollback/recovery plan.

A skipped integration test is **NOT TESTED**, not passed.

### Gate 4 — AI gateway

Candidate: `feat/infiniteX-phase-3-ai-gateway`.

Acceptance criteria:

- Provider adapters implement one typed internal contract.
- Secrets remain server-side.
- Timeouts, bounded retries, cancellation, quota enforcement, and error normalization are tested.
- Provider fallback cannot bypass policy, budget, or data-residency constraints.
- A deterministic mock provider supports free local testing.
- No paid provider is activated by default.

### Gate 5 — Agent runtime and orchestration

Candidates: agent adapters and orchestration branches.

Acceptance criteria:

- Agents have explicit versioned capabilities and tool allowlists.
- Model output is untrusted input and cannot grant permissions.
- Tool calls are schema-validated and authorized server-side.
- Every run has tenant/workspace scope, correlation ID, deadline, attempt limit, concurrency limit, payload/output limit, and cost budget.
- Side-effecting tools require idempotency and appropriate approval.
- Execution occurs in an isolated boundary; synchronous deadline checks must not be described as hard preemption.
- Audit records identify actor, tool, target, decision, and outcome.

### Gate 6 — Security, observability, and release

Acceptance criteria:

- Threat model and trust boundaries are current.
- Authentication and authorization are tested independently.
- Tenant isolation is verified at API and database layers.
- Dependency advisories are triaged without blind force upgrades.
- Logs are structured, redacted, correlated, and do not expose secrets.
- Failure recovery and rollback are exercised in a non-production environment.
- Human release approval is recorded separately from CI success.

## 5. Conflict and integration rules

1. Never merge two PRs solely because their titles describe different phases.
2. Compare base lineage and file-level overlap before selecting an order.
3. Do not retarget a PR to a new base until its diff and migration assumptions have been re-evaluated.
4. Never cherry-pick a migration without its complete prerequisite chain.
5. Never resolve conflicts by choosing the newest file without understanding semantic behavior.
6. Preserve existing branches and PRs until a human approves consolidation.
7. Use small integration PRs with one coherent capability and explicit acceptance criteria.
8. Re-run CI after every rebase, cherry-pick, or conflict resolution.
9. Require independent review for authorization, database, and execution-boundary changes.
10. No automatic merge or production release.

## 6. Evidence status vocabulary

| Status | Meaning |
|---|---|
| VERIFIED | Direct evidence exists for the exact commit and stated environment |
| PARTIAL | Some criteria have evidence; material criteria remain open |
| BLOCKED | A missing prerequisite prevents safe implementation or acceptance |
| NOT TESTED | No valid execution evidence exists |
| UNASSESSED | Candidate has not yet had sufficient source/diff review |

Never convert PARTIAL, BLOCKED, NOT TESTED, or UNASSESSED into VERIFIED because a branch exists or a design document is complete.

## 7. Current decision register

| Decision | Current status | Required next evidence |
|---|---|---|
| Frontend source baseline | PARTIAL | Exact-head CI plus browser and assistive-technology QA |
| Canonical backend | BLOCKED | Read-only deployed/repository schema and API reconciliation |
| Workflow migration readiness | BLOCKED | Authoritative base schema, writer inventory, disposable DB tests |
| AI gateway production readiness | UNASSESSED | Adapter/security/quota/test review |
| Agent runtime readiness | UNASSESSED | Tool authorization and isolated execution evidence |
| Production release | BLOCKED | All gates, rollback rehearsal, explicit human approval |

## 8. Free-first engineering alternatives

Prefer the smallest toolchain that can produce trustworthy evidence:

- Node's built-in test runner for dependency-free source-contract tests.
- Existing npm lockfile and pinned CI runtime for reproducible frontend builds.
- Local Supabase CLI and disposable local PostgreSQL for database integration tests, subject to available device/runtime capacity.
- Deterministic fake model/provider adapters for local gateway tests.
- GitHub Actions with least-privilege workflow permissions.
- Static analysis and dependency review before adding paid scanning services.
- Manual browser testing where automated browser infrastructure is unavailable; label it as manual evidence.

Do not claim a free tier is unlimited. Record quotas, retention, and operational limits.

## 9. Immediate next actions

1. Refresh PR metadata and exact head/base SHAs for the candidate workstreams.
2. Compare workflow branches and migration trees to identify the true prerequisite chain.
3. Inventory all schema definitions and writers from repository history and deployed read-only evidence.
4. Produce the canonical backend ADR only when evidence is sufficient.
5. Keep PR #43 as an isolated frontend QA slice.
6. Keep PR #35 unmerged and its migration unapplied until Gate 2 and Gate 3 pass.
7. Prepare a small integration PR only after overlap and compatibility checks.

## 10. Explicit non-actions

This manifest does not authorize:

- merging or closing PRs
- deleting branches or files
- force-pushing or rewriting Git history
- applying or rolling back a production migration
- changing Supabase policies, secrets, or project settings
- changing billing or paid provider settings
- deploying or publishing a release
- enabling autonomous external side effects

**Final engineering rule:** Integrate only what has a verified dependency chain, reproducible tests, a clear security boundary, and an approved change plan. The objective is one coherent, maintainable InfiniteX system—not the largest possible codebase.
