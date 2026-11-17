# GH-19 — InfiniteX Architecture and Repository Audit

**Status:** Source-level review updated for the isolated P0 hardening branch. CI evidence is tied to exact commit SHAs and run URLs; this document is not a production security certification.
**Branch:** chore/phase-3d4-p0-hardening
**Audit baseline:** 88322ce6f1ac925e34ae5011a6d7c4a74b53b5ff (parent of the P0 hardening commit)
**Scope:** Frontend source, package scripts, TypeScript configuration, GitHub Actions workflows, repository tree, and architecture/security plans.

## 1. Executive result

InfiniteX remains a frontend demonstration workspace. It is not yet a production AI-agent orchestration platform, and no live backend, provider execution, production identity, or workspace authorization was verified in this review.

The recovery branch at `88322ce6f1ac925e34ae5011a6d7c4a74b53b5ff` has a successful GitHub Actions run #58 (`44096600026`): both jobs passed, including 8 unit tests, 12 Playwright tests, dependency audit, TypeScript validation, and production build. This evidence applies to that exact recovery commit only. The P0 hardening commit requires its own fresh CI run before its changes are considered verified.

## 2. Findings

| ID | Severity | Finding | Evidence / action |
|---|---|---|---|
| GH19-01 | Medium | Generated output and compiler artifacts are tracked in the candidate tree (dist/, *.tsbuildinfo, generated Vite config JS/declaration files). | Added ignore rules. Existing tracked files are intentionally not deleted in this phase. |
| GH19-02 | Low | Sample-agent search used locale-dependent lowercasing. | Changed normalization to deterministic toLowerCase(); added regression coverage. |
| GH19-03 | Low | Search helper accepts runtime input broader than its declared TypeScript types. | Added tests for null/undefined/malformed records; runtime guard already uses optional property access. |
| GH19-04 | Medium | @vercel/analytics is declared in the package manifest but no usage was found in the inspected candidate application source. | Keep dependency review open; do not remove it until its intended deployment use is confirmed. |
| GH19-05 | High | No production API server, authenticated identity boundary, workspace authorization, or database/RLS integration is present in the inspected frontend candidate. | Explicitly retain as NOT VERIFIED / NOT IMPLEMENTED in this candidate; do not connect UI directly to privileged services. |
| GH19-06 | Medium | Error boundary handles React render/lifecycle errors, not arbitrary event-handler or asynchronous failures. | Keep local async error handling and user-visible retry states as future implementation requirements. |
| GH19-07 | Medium | Supply-chain pinning differed between workflows. | `frontend-ci.yml` pins checkout, setup-node, and upload-artifact to immutable SHAs. The corresponding upstream action commits were checked and report valid GitHub signatures. The separate Vite remediation workflow previously used floating tags; this P0 change aligns it with the pinned toolchain. |

## 3. Current architecture

The inspected application is a React + TypeScript + Vite frontend with:
- UI components and local view state.
- A theme hook using localStorage with a session fallback.
- Static sample agents, pipelines, logs, and unavailable metric values.
- A local search helper.
- A React error boundary and guarded root mount.
- Node test-runner unit tests and Playwright browser tests in CI.

The following are NOT VERIFIED as implemented in this candidate:
- Production API service.
- Authentication/session lifecycle.
- Workspace membership and role-based authorization.
- Database schema, migrations, and row-level security.
- AI provider adapters or actual agent execution.
- Live telemetry, billing, or quota accounting.

## 4. Safe target architecture

```text
React / TypeScript UI
  ├── Presentation components
  ├── Application hooks and state
  ├── Typed API client
  └── Runtime-validated contracts
           |
           | HTTPS / JSON / versioned API
           v
TypeScript modular monolith
  ├── Identity and session boundary
  ├── Workspace authorization policy
  ├── Agent registry (metadata first)
  ├── Task lifecycle
  ├── Audit event service
  ├── Provider adapters
  └── Health / readiness endpoints
           |
           v
PostgreSQL
  ├── Workspace-scoped records
  ├── Foreign keys and constraints
  ├── Reviewed migrations
  └── Tested RLS defense-in-depth
```

This is a target architecture only. It is not a claim that these services are deployed.

## 5. Security invariants

1. Browser code must never contain provider secrets or privileged database credentials.
2. Every protected API operation authenticates the caller and authorizes the specific workspace/resource on the server.
3. Client-supplied user IDs, roles, and workspace IDs are never treated as proof of permission.
4. All untrusted request bodies are validated on the server with size limits.
5. Database access uses least-privilege roles and parameterized queries.
6. RLS is tested with cross-workspace negative tests; it does not replace API authorization.
7. Logs redact tokens, cookies, passwords, keys, and sensitive payloads.
8. Provider calls use bounded timeouts, safe retry semantics, quota controls, and normalized errors.
9. AI-generated code is proposed as a reviewable patch; it is never automatically executed against production or merged without human review.
10. Migrations, deployments, secrets, billing, and destructive actions require explicit approval.

## 6. Free-first technology choices

- Keep the existing React/Vite stack unless measured needs justify change.
- Prefer the Node built-in test runner and existing TypeScript toolchain where sufficient.
- Use PostgreSQL-compatible local/test environments for integration tests before selecting production hosting.
- Evaluate Zod or JSON Schema for runtime request validation before adding a dependency.
- Use provider-neutral interfaces; do not bind core domain logic to a single AI vendor.
- Record free-tier quotas, storage, egress, and usage limits. Free tiers are not unlimited.

## 7. Verification plan

For every code change, record:
- Exact commit SHA.
- CI run URL and final conclusion.
- Unit, typecheck, dependency audit, and production build results.
- Browser and accessibility test results where applicable.
- Any skipped checks and why they were skipped.

Production-readiness requires additional API integration, authentication, cross-workspace authorization, database/RLS, secret scanning, deployment configuration review, manual accessibility review, and real-device QA.

## 8. Explicit non-actions

- No tracked generated artifacts were deleted.
- No PR merge or production deployment.
- No database migrations or data mutation.
- No secrets, credentials, billing, or paid services changed.
- No autonomous self-modifying or self-deploying code was introduced.

## 9. Acceptance gate

GH-19 is not a production approval. The candidate can progress only after fresh CI passes and the remaining architecture/security gaps have concrete implementation plans, negative tests, and human review.

## 10. P0 recovery update — 2026-11-17

### Exact baseline and scope
- Recovery base commit: `88322ce6f1ac925e34ae5011a6d7c4a74b53b5ff`.
- Existing PR #9 remains open, draft, and unchanged; its head remains `b91de221a8f7a84b95f783878e286a9cc47e2e17`.
- P0 branch: `chore/phase-3d4-p0-hardening`.
- Scope is limited to the two GitHub Actions workflows and this audit document. No application source, dependency manifest, lockfile, secrets, settings, billing, deployment, or PR metadata is changed.

### GH19-08 — Conflicting Vite remediation workflow
The previous `.github/workflows/vite-security-remediation.yml` generated a Vite 6 candidate lockfile on the runner while the recovery branch uses Vite 8.3.7. It did not commit that generated lockfile, but its result was inconsistent with the active toolchain and could mislead reviewers. The workflow is changed to verify the checked-in Vite 8 toolchain using `npm ci`, `npm ls`, `npm audit`, TypeScript checks, unit tests, and the production build. It no longer generates or uploads candidate manifests.

### CI trigger coverage
The main frontend workflow is configured to run on pushes to both the original recovery branch and this isolated P0 branch. Its pull-request base filters remain explicit. This ensures the P0 branch can receive a fresh CI result without changing PR #9.

### Action provenance
The pinned upstream commits for `actions/checkout`, `actions/setup-node`, and `actions/upload-artifact` were queried in their respective upstream repositories. GitHub reports valid commit signatures for the inspected SHAs. This validates those exact commit objects; it is not a guarantee against every future supply-chain risk.

### Verification state
- Prior evidence: run #58 / `44096600026` passed on the recovery base commit only.
- P0 hardening commit: fresh CI is required; no passing result is claimed here.
- The branch remains isolated. No PR was created, no merge occurred, and no deployment or repository settings were changed.

### Remaining controls
Branch protection and required status checks are repository governance settings and are intentionally outside this P0 write authorization. Manual Android QA, backend authentication, workspace authorization, database/RLS tests, and production AI-provider execution remain not verified.
