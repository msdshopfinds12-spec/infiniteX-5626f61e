# InfiniteX Canonical Integration Plan

**Status:** PLAN / ISOLATED CANDIDATE — no feature branches merged
**Canonical candidate base:** PR #60 head `7606e9fb574acc57138baa02ff36407ae0bd61d5`
**Candidate branch:** `engineering/infinitex-canonical-integration-candidate`
**Review date:** 2026-11-21

## 1. Objective

Establish one auditable integration lineage for InfiniteX while preserving the existing PR branches as source evidence. Reconcile authentication, product UI, and dependency security without importing incompatible package manifests or replacing working application code blindly.

This document is an engineering plan, not proof of integrated runtime behavior.

## 2. Candidate sources

| Source | Role | Decision |
|---|---|---|
| PR #60 — auth foundation | Candidate base for authentication/session lifecycle and typed Supabase browser client | Use as isolated starting point; do not merge the PR |
| PR #99 — product UI / application CI | Candidate source for truthful demo UX, mobile navigation, UI components and app CI | Select individual changes after file-by-file compatibility review |
| PR #100 — Vite security remediation | Candidate evidence for Vite 6.4.6 / esbuild 0.25.12 / plugin-react 4.7.0 remediation on its own dependency lineage | Do not apply its package files to PR #60 as-is |
| PR #95–#101 | Migration, database contract, UI and documentation evidence | Preserve; reconcile only when their prerequisites are met |

## 3. Verified incompatibilities and hazards

### 3.1 Toolchain mismatch

The inspected PR #60 package lineage uses Vite 8.3.8 and @vitejs/plugin-react 6.1.2. PR #100 changes a different package lineage from Vite 5.4.10 to Vite 6.4.6 and retains @vitejs/plugin-react 4.3.3 in the package diff. A separately reported PR #100 state lists plugin-react 4.7.0; this discrepancy must be resolved from the exact PR head manifest and lockfile before selecting versions.

**Decision:** PR #100's package.json and package-lock.json must not be cherry-picked onto this branch. First inspect exact-head package metadata, peer dependency constraints, Node engine requirements, and npm audit output. Then choose one coherent, supported Vite/plugin pair and regenerate the lockfile from that manifest.

### 3.2 UI changes overlap auth-integrated application source

PR #99 changes `src/App.tsx`, `src/main.tsx` is changed by PR #60, and PR #99 substantially rewrites dashboard components and shared CSS. A blind file replacement risks removing authentication wiring, protected states, truthful demo labels, or accessibility improvements.

**Decision:** Preserve PR #60's auth bootstrap and session provider. Port UI changes as small component-level patches, retaining auth props, fail-closed bootstrap, and explicit demo state. Avoid replacing `src/main.tsx` wholesale.

### 3.3 PR #99 changes application scripts and TypeScript settings

PR #99 adds lint/test scripts and changes TypeScript configuration. These changes need validation against PR #60's current scripts, test layout, tsconfig references, and exact dependency graph. Relaxing `noUnusedLocals` / `noUnusedParameters` or excluding tests must not silently weaken type-check coverage.

**Decision:** Keep strict compiler checks where feasible. Integrate tests using explicit scripts and ensure production source and test source are both checked by appropriate tools.

### 3.4 Historical evidence is not current CI proof

PR documentation includes CI observations for earlier commit SHAs. Those records must not be represented as CI for this integration branch. New checks must run on the exact resulting head SHA.

## 4. Integration sequence

1. **Baseline freeze:** record this branch's package.json, package-lock.json, tsconfig, Vite config, source tree and PR #60 exact-head checks.
2. **Dependency decision:** reconcile PR #60 and PR #100 package manifests; inspect peer dependencies and lockfile consistency; choose one compatible toolchain.
3. **UI port:** selectively integrate PR #99 components and styling while preserving PR #60 authentication wiring and truthful demo indicators.
4. **Application contract:** define typed feature-service boundaries for projects, agents, workflows, logs and usage. No client-side privilege claims.
5. **Backend authorization:** require database-enforced RLS and trusted server-side authorization for privileged operations. Client capability state is UX only.
6. **Workflow safety:** enforce idempotency, atomic state transitions, attempt fencing, ownership checks and safe retry semantics on trusted backend paths.
7. **Verification:** run clean install, dependency audit, typecheck, lint, unit tests, security tests, build and exact-head CI. Add synthetic two-user isolation tests before claiming RLS isolation.
8. **Release review:** human approval required before merge, production configuration changes, migrations, or deployment.

## 5. Non-negotiable security invariants

- No service-role, `sb_secret_*`, worker, webhook, or billing secrets in browser bundles or `VITE_*` variables.
- Never select or expose `platform_api_keys.key_hash` to browser code.
- Browser workflow requests contain only user-authorized input; owner, status, attempt, output and timestamps are server-owned.
- UI route guards and client capability snapshots are not authorization boundaries.
- Database RLS and trusted backend checks are mandatory for data access and mutations.
- Missing/invalid auth configuration fails closed; no silent authenticated/demo fallback.
- No fabricated live metrics, agents, pipelines, logs or backend connection status.

## 6. Database readiness dependency

Phase 64C remains blocked until a genuine schemaVersion 2 metadata-only catalog capture is obtained and independently reviewed. The existing V1 snapshot must not be relabeled or approved to satisfy CI. Disposable PostgreSQL fixtures are not evidence of live Supabase schema parity.

## 7. Approval boundaries

This branch creation and planning commit do not authorize:
- merging any PR;
- production deployment or Vercel environment changes;
- production database writes, migrations, grants, RLS or cron changes;
- secret rotation or billing changes;
- public release.

## 8. Current completion statement

**Verified:** isolated branch created from the exact PR #60 head; PR #99 and PR #100 patches inspected as candidate sources; toolchain and application-file overlap identified; integration plan recorded.

**Not yet verified:** combined application build, integrated UI/auth behavior, live backend data access, RLS isolation, workflow execution, production readiness.

**Next engineering task:** inspect the exact PR #60 and PR #100 dependency manifests and lockfiles, then produce a compatibility matrix before changing any application code.
