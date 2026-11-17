# InfiniteX CI Implementation Plan

**Status:** Initial Node.js CI workflow is included in this branch. Execution results are pending until GitHub Actions completes.  
**Primary repository:** `msdshopfinds12-spec/infiniteX-5626f61e`

## 1. Objectives

- Detect TypeScript errors and production-build failures on pushes and pull requests.
- Use the lockfile and `npm ci` for repeatable installation.
- Keep workflow permissions minimal.
- Avoid secrets, deployments, automatic merges, and paid services.
- Separate the primary React app from Python and agent-template CI.

## 2. Primary app: observed project contract

From the inspected `package.json`:
- Runtime: React 18 + Vite + TypeScript.
- `npm run lint`: `tsc -b --noEmit` (observed to fail in the first CI run with TS6310).
- `npm run build`: `tsc -b && vite build`.
- A test script is not currently defined.
- A `package-lock.json` exists.

### TypeScript check strategy

The first CI run confirmed that `npm run lint` fails with TS6310 because the build-mode command is invoked with `--noEmit` while the root TypeScript project references `tsconfig.node.json`. The workflow now uses a direct application-project check, `npx tsc --noEmit -p tsconfig.json`, then runs the repository's full `npm run build` command. The latter invokes `tsc -b` without the `--noEmit` override and then Vite.

This is a **CI-level workaround**, not a correction to the existing `package.json` lint script. The script/configuration should be fixed in a separately approved source-code change after confirming the desired project-reference layout.

The workflow therefore runs:
1. `npm ci`
2. `npx tsc --noEmit -p tsconfig.json`
3. `npm run build`
4. `npm audit --json` as a non-blocking report step (advisories are surfaced, not silently auto-fixed).

It does **not** run `npm test` because no test script was observed. Add a real test framework and test script in a separately planned change; do not invent a passing test stage.

## 3. Initial workflow design

File: `.github/workflows/ci.yml`

Triggers:
- Push to `main` and `feat/**`.
- Pull requests targeting `main`.
- Manual `workflow_dispatch`.

Controls:
- Ubuntu hosted runner.
- Node.js 22.
- Full-SHA-pinned `actions/checkout` v7.0.1 and `actions/setup-node` v7.1.0 (Node 24-compatible action runtimes).
- `contents: read` only.
- `persist-credentials: false`.
- npm cache via setup-node.
- Job timeout and concurrency cancellation.
- A non-blocking npm advisory report; it does not change dependencies or suppress the reported findings.
- No secrets, deployment steps, artifact publication, or write permissions.

A push to the approved feature branch should trigger this workflow after the branch commit is pushed. Actual completion must be checked in GitHub Actions.

## 4. Proposed quality gates

| Gate | Current state | Next requirement |
|---|---|---|
| Dependency installation | Included in workflow | Confirm `npm ci` passes |
| TypeScript check | Included as `npm run lint` | Confirm CI result |
| Vite production build | Included as `npm run build` | Confirm CI result |
| Unit/component tests | Not configured | Add Vitest/Testing Library only in a separately approved implementation |
| Accessibility tests | Not configured | Add automated checks plus manual keyboard/screen-reader review |
| Dependency vulnerability review | Not included in initial CI | Establish a triage policy; avoid unstable fail-on-any-advisory behavior |
| Secret scanning | Not verified | Review repository-level GitHub security settings and permissions |
| SAST | Not configured | Select a tool and tune rules before making it a blocking gate |
| E2E tests | Not configured | Add only after stable user journeys and test environment exist |

## 5. GET language CI investigation (separate repository)

Previously observed repository: `msdshopfinds12-spec/infiniteX-get-language`.

Run #14 reported four failed jobs with runner ID 0, no runner name, and no recorded steps. Log retrieval returned `BlobNotFound`. This is consistent with a failure before normal step execution, but does not prove a specific GitHub-hosted runner outage or workflow defect.

Safe investigation sequence:
1. Inspect the newest run's event, conclusion, timestamps, workflow file, and job metadata.
2. Check whether GitHub recorded runner assignment or any step start.
3. Retrieve logs again only when GitHub exposes them.
4. If evidence still shows no runner/steps, compare with a new run after checking GitHub Actions service status and repository runner settings.
5. Only after a runner starts should source-level failures be diagnosed from the first failing step.
6. Once runner infrastructure is healthy, validate Python 3.11 and 3.12, Ruff, pytest, package build, and wheel import.

Do not label the GET source as broken based only on a runner ID of 0 and missing logs. Do not rerun jobs as part of this branch change.

## 6. Other repositories

Use separate workflows matched to each repository's actual stack:
- IQ Core: Python compile/import checks, unit tests, lint, and security checks after inspecting its current dependency and test configuration.
- EVE/AI templates: install/build/type-check/test using their actual lockfiles and package scripts; no provider secrets in PR workflows.
- Data agent: tests must verify read-only enforcement and query limits.
- Copilot skill repositories: validate Markdown/frontmatter/schema as appropriate; do not treat prompt files as executable agent services.

Do not copy one monolithic workflow across repositories with different runtimes.

## 7. Failure handling and diagnostics

For every failed run, capture:
- Repository, workflow, run ID, event, branch, commit SHA.
- Job ID/name, runner label/ID, timestamps.
- First failed step and exit code, if any.
- Relevant sanitized log excerpt.
- Whether failure occurred before or after runner execution.
- Reproduction command and environment, when known.

Classify as:
- `RUNNER_OR_SERVICE`
- `DEPENDENCY_INSTALL`
- `STATIC_ANALYSIS`
- `TEST_FAILURE`
- `BUILD_FAILURE`
- `CONFIGURATION`
- `PERMISSION_OR_SECRET`
- `UNKNOWN`

A retry is diagnostic, not a fix. Preserve the original run and compare evidence.

## 8. Cost and safety controls

- Use GitHub-hosted CI only within the account's available quota and current plan limits.
- No third-party paid scanner is required by this initial workflow.
- No AI provider is called by CI.
- No credentials or secrets are required for build/lint.
- Do not enable auto-merge, deployment, or privileged workflow permissions.
- Review workflow changes before expanding permissions.

## 9. Completion criteria

The initial CI is **implemented** when the workflow file is present on the feature branch. It is **validated** only after a real run completes and the commit SHA, run URL, and job conclusions are recorded. It is **release-ready** only after the separate security review and human release approval.
