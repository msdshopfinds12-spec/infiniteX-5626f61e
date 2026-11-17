# GH-16 — Implementation Manifest

**Status:** Planning baseline only  
**Target branch:** `feat/gh16-infiniteX-integration`

This manifest defines the implementation order and the evidence required to mark work complete. A checked-in plan is not proof of implementation.

## Status vocabulary

- **VERIFIED:** directly supported by current source or a reproducible successful test.
- **PARTIAL:** some implementation exists, but scope or verification is incomplete.
- **BLOCKED:** cannot proceed safely because a dependency, decision, or permission is missing.
- **NOT TESTED:** implementation may exist, but no valid test evidence has been collected.
- **PROPOSED:** future design only.

## Baseline snapshot (historical inspection; re-verify before coding)

| Area | Status | Evidence / limitation |
|---|---|---|
| React/Vite dashboard on main | PARTIAL | UI exists; data was sample/static |
| Dashboard metric truthfulness | PARTIAL | Main had hardcoded-looking metrics; alternate branch improved labels |
| Backend API on feature branch | PARTIAL | `/healthz`, `/readyz` previously observed; broader endpoints not verified |
| Agent/task API | NOT VERIFIED | No complete routes confirmed in inspected API entrypoint |
| Authentication | PARTIAL | Security/auth source existed on separate branch; provider and production integration unverified |
| Workspace authorization | PARTIAL | Policy/repository and DB tests existed on separate branch; production enforcement unverified |
| Database migrations | PARTIAL | Migration/test files existed; no live migration authorized or verified |
| Frontend API integration | NOT TESTED | No end-to-end live integration evidence |
| Frontend build | NOT TESTED | Do not infer from backend CI |
| Backend CI | VERIFIED (historical run only) | Run #43972200685 reported 67/67; SHA must be compared with current head |
| Production deployment | NOT VERIFIED | No current production smoke-test evidence |
| Mobile/accessibility QA | NOT TESTED | Manual and automated checks required |

## Phase 0 — Re-inspection (read-only)

- [ ] Confirm branch HEAD and base SHA.
- [ ] Read root and app-level package manifests.
- [ ] Read frontend entrypoint, routes, components, API utilities, types.
- [ ] Read both candidate server entrypoints and package manifests.
- [ ] Inspect workflows and current CI status.
- [ ] Inspect current branch diff against main.
- [ ] Identify generated/build artifacts and repository hygiene issues.
- [ ] Record exact source paths and commit SHAs.

**Exit gate:** evidence table updated from current branch, not historical notes.

## Phase 1 — Architecture and contract decisions

- [ ] Select one canonical API server.
- [ ] Record why Hono/Fastify/existing server was selected.
- [ ] Define API error envelope, pagination, versioning, and validation.
- [ ] Define identity/session boundary.
- [ ] Define workspace/resource authorization matrix.
- [ ] Define initial database entities and constraints.
- [ ] Define provider adapter contract.
- [ ] Define migration and rollback approach.

**Exit gate:** decisions reviewed; no implementation or migration yet.

## Phase 2 — Backend vertical slice

- [ ] Health and readiness behavior.
- [ ] Request ID and structured logging.
- [ ] Input validation and normalized errors.
- [ ] Identity boundary (test adapter only until production provider selected).
- [ ] Workspace-scoped authorization.
- [ ] First read-only resource endpoint.
- [ ] Unit, integration, and authorization tests.

**Exit gate:** tests pass on current commit; negative authorization tests included.

## Phase 3 — Frontend integration

- [ ] Typed API client with base URL configuration.
- [ ] Loading, empty, error, stale, demo, and live states.
- [ ] Replace static data only when endpoint is verified.
- [ ] Remove or clearly label simulated metrics.
- [ ] Add safe retry behavior and cancellation.
- [ ] Responsive/mobile layout and accessible interaction.

**Exit gate:** browser tests prove the intended request/response flow; no false live indicators.

## Phase 4 — Security and quality

- [ ] Cross-workspace isolation tests.
- [ ] Role and ownership tests.
- [ ] CSRF/session tests where applicable.
- [ ] Rate-limit and input-boundary tests.
- [ ] Secret and dependency scan.
- [ ] Accessibility checks.
- [ ] Dependency/license and bundle-size review.
- [ ] Failure-mode and recovery tests.

**Exit gate:** no unresolved critical/high findings; exceptions documented and approved.

## Phase 5 — Release preparation (not deployment)

- [ ] Build and test commands executed with logs.
- [ ] Migration dry-run/review where supported.
- [ ] Rollback steps validated in a non-production environment.
- [ ] Environment variable inventory checked without exposing values.
- [ ] Production smoke-test plan prepared.
- [ ] Human release approval recorded.

**Exit gate:** explicit release approval required before any production action.

## Change-control rules

- Work only on `feat/gh16-infiniteX-integration` until a PR is explicitly authorized.
- Do not merge the broad `feat/provider-neutral-billing-sandbox` branch wholesale.
- Do not overwrite existing files without fetching current content and blob SHA.
- Do not commit secrets, real user data, or generated build output.
- Do not run destructive commands or production migrations.
- Do not activate billing or paid integrations.
- Every implementation claim must cite a commit, test run, or reproducible evidence.
