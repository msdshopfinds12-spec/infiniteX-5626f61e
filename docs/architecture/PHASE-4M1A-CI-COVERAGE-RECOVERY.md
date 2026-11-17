# Phase 4M.1A — CI Coverage Recovery

## Objective

Ensure the Phase 4M AI-orchestration readiness work receives the repository's existing frontend and workflow-security checks without broadening GitHub Actions permissions or enabling deployment credentials.

## Verified root cause

The Phase 4M branch is `phase-4m-ai-orchestration-readiness`. The existing Frontend CI pull-request target list did not include that base branch. The CI Security Regression pull-request target list also omitted it. The security workflow is path-filtered to workflow, scanner, and package-manifest changes.

PR #15 is stacked on `security/phase-3d-4l-regression`, which is itself the head of PR #14. The follow-up PR therefore targets the Phase 4M branch, preserving the existing review stack.

## Changes

- Add the dedicated Phase 4M branch to Frontend CI pull-request targets.
- Add this recovery branch to Frontend CI push targets so the proposed workflow changes receive push validation.
- Add the dedicated Phase 4M branch to Security Regression pull-request targets.
- Add this recovery branch to Security Regression push targets, retaining its existing path filters.
- Preserve read-only `contents: read` permissions at workflow and job scope.
- Preserve immutable action commit pins, checkout credential persistence disabled, finite job timeouts, npm lockfile installation, and concurrency cancellation.
- Do not add secrets, write permissions, deployment jobs, provider calls, or database operations.

## Expected validation

1. Frontend CI: workflow-policy scan, policy regression tests, dependency audit, TypeScript check, unit tests, and production build.
2. Frontend browser job: Playwright and axe accessibility checks.
3. CI Security Regression: structural workflow scan and policy regression tests.
4. Confirm checks are attached to the exact PR head SHA.
5. Inspect job logs for any failures; a queued or skipped run is not a pass.

## Non-goals

This change does not connect an AI provider, provision PostgreSQL/Supabase, alter authentication, run migrations, deploy, merge PR #14/#15, or change repository branch protection.

## Release gate

Keep this PR in draft until the exact-head checks complete and a human reviews the diff. Merge and deployment remain separate approval decisions.
