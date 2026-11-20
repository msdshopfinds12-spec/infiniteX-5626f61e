# Phase 4N.10 — GitHub Evidence and Recovery Execution Report

**Captured:** 2026-11-20 UTC  
**Scope:** Read-only GitHub review plus offline CI workflow refinement on the recovery branch.  
**Production mutations:** None.

## 1. Current recovery PR

- PR: #54 — `[DRAFT] Recover InfiniteX database source of truth and add contract gates`
- Base: `main`
- Head: `recovery/infinitex-database-source-of-truth`
- Initial head inspected: `46feb3c437846736e3d5878915acc360fbee99c8`
- Draft state: open, not merged.
- The initial compare showed seven files added, no files modified or deleted.

This PR remains an isolated database-provenance workstream. It is not the application integration branch.

## 2. Exact CI result and root cause

GitHub Actions run:
- Run ID: `44654713669`
- Commit: `46feb3c437846736e3d5878915acc360fbee99c8`
- Workflow: `Database Contract Gate`
- Result: `failure`

Observed job results:
- `Production safety invariant`: success.
- `Offline migration and contract checks`: failure.
- Both JavaScript validation scripts passed `node --check`.
- Migration integrity step exited with code 2 because `supabase/migrations/` does not exist on the recovery PR branch.
- The database snapshot validation step was skipped because the preceding step failed.

The failure is a genuine missing-source blocker, not a JavaScript syntax failure. The workflow was updated so the snapshot check is also evaluated after a migration-check failure, and the job summary records the readiness state. This is intended to expose all blockers, not to turn a blocked database into a passing check.

## 3. Branch evidence and integration candidates

The repository contains multiple independent development lines. The repository integration manifest on `docs/phase-4n9-repository-integration-manifest` explicitly recommends capability-based integration and warns against merging branches in bulk.

### PR #50 — combined frontend and canonical backend candidate

- Head: `eng/infinitex-unified-ui-backend-2026-11-20`
- Head SHA at inspection: `82c347d1b6a303de68e788adc5739852a0fdba18`
- Base: `main`
- Draft and unmerged.
- 38 files changed.
- Three GitHub Actions workflows passed:
  - Node 22 / npm verification.
  - Node tests, Deno tests/checks, application build.
  - Install, application build, worker security regression.
- Supabase Preview was skipped because the branch is not associated with a Supabase Branch.
- Vercel deployment status checks failed due the account's deployment build-rate limit.

These checks establish source-level CI evidence for this exact candidate SHA only. They do not establish deployed Edge Function parity, production database parity, browser/device QA, or release readiness.

The associated live-readiness reconciliation reports that the frontend still operates in demo mode and that deployed Edge Function source differs from the candidate. Treat those as explicit integration blockers.

### PR #46 — canonical Edge Function candidate

- Head: `chore/phase-4n21b-canonical-edge-functions`
- Draft and unmerged.
- Adds shared CORS and worker-security modules, Edge Function source, and Node/Deno regression tests.
- Must be reviewed against deployed source, approved origin configuration, caller behavior, and rollback requirements before deployment.

### PR #35 — transactional step fencing candidate

- Head: `fix/phase-4n8b-transactional-step-fencing-impl`
- Base: `fix/phase-4n8b-transactional-step-fencing`
- Draft and unmerged.
- Adds a candidate migration and worker changes.
- The candidate migration is not present in the inspected live migration ledger and its transition RPC is not deployed.
- Keep blocked until the full writer/lock-order inventory and disposable PostgreSQL concurrency suite pass.

### PR #43 — mobile navigation and accessibility candidate

- Draft and unmerged.
- Its base is another feature branch, not `main`.
- Do not merge or cherry-pick until its complete ancestry and frontend dependency chain are reviewed.

## 4. Workflow runtime findings to preserve

The Phase 4N.10 source audit records:

- Retry decision logic exists but is not wired into the inspected worker execution paths.
- The current timeout helper is cooperative; it cannot preempt a synchronous blocking action.
- The Phase 4N.8B step-transition migration is schema-dependent and not deployed.
- The existing `workflow_step_runs.attempt` is a parent workflow-generation fence, not a separate per-step retry counter.
- A durable retry design should use a separately reviewed append-only step-attempt ledger, leases, idempotency, and explicit `outcome_unknown` handling. This is a design proposal, not an approved migration.
- Database fencing alone cannot guarantee exactly-once delivery to external services.

Keep retry execution disabled until durable state transitions and real database race tests exist.

## 5. Canonical integration recommendation

Do not merge PRs #46, #49, #50, #35, or #43 as a batch.

Recommended sequence:

1. Recover the 19 original migration SQL files, or establish a separately labeled reconstructed baseline from an authorized schema export.
2. Capture and review a sanitized catalog snapshot including exact RPC overloads, grants, RLS, triggers, constraints, indexes, and function security settings.
3. Reconcile the live Supabase Edge Function versions with PR #46 candidate source.
4. Treat PR #50 as the leading combined frontend/backend candidate for deeper review, not as an automatically approved integration target.
5. Confirm the canonical Vercel project and intended production domain; do not change settings while the project target is ambiguous or deployment quota is exhausted.
6. Complete browser, Android viewport, keyboard, accessibility, authentication, and real API integration tests.
7. Run disposable PostgreSQL tests for workflow claim, recovery, fencing, duplicate transitions, retries, and ownership.
8. Merge only small reviewed slices after exact-head CI and explicit human approval.

## 6. Release gate

Production release remains BLOCKED until:
- source provenance and schema parity are verified;
- backend canonical ownership and deployed function parity are resolved;
- authentication, RLS, API, and tenant-isolation tests pass;
- the frontend is no longer falsely presented as live when using demo data;
- browser/device QA and rollback rehearsal are complete;
- canonical Vercel project/domain and deployment capacity are confirmed;
- a human explicitly approves production changes.

## 7. Non-actions

No PR was merged or retargeted. No branch was deleted or force-updated. No production database was modified. No migration was applied. No secret, billing, Vercel setting, or deployment was changed.

**Decision:** preserve PR #54 as a strict source-readiness gate. Advance the application through evidence-backed vertical slices; do not confuse green frontend CI with production readiness.
