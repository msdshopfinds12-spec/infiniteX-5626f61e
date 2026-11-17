# InfiniteX Release Candidate Pipeline

**Workflow:** `.github/workflows/release-candidate.yml`  
**Trigger:** Manual `workflow_dispatch` only.  
**Purpose:** Re-validate and package a release candidate artifact without deploying it.

## What it does
1. Checks out the exact selected commit with checkout credentials persistence disabled.
2. Installs lockfile-pinned dependencies.
3. Runs workflow policy, browser/server boundary, Edge Function source checks and their tests.
4. Runs dependency audit, TypeScript checks, unit tests and production build.
5. Runs Deno worker tests and typechecks the three hardened Edge Functions.
6. Writes a release manifest containing repository, exact SHA, ref and workflow run ID.
7. Uploads the built `dist/` artifact for seven days.

## What it deliberately does not do
- No production or preview deployment.
- No Vercel API call or deployment token.
- No GitHub release, tag, commit, PR merge or write permission.
- No database migration, infrastructure apply/destroy or secret access.
- No billing or paid service activation.

## Release acceptance
A release candidate is eligible for human review only if the workflow succeeds on the exact intended commit SHA, all required PR checks are green on that SHA, human code review is complete, and security/operational blockers are resolved.

A successful candidate workflow is not proof of production deployment, production parity, backup recoverability or tenant isolation. Those require separate evidence.

## Running it
From GitHub: Actions → InfiniteX Release Candidate → Run workflow. Select the intended branch, then inspect the run and download its artifact. Verify `release-manifest.txt` and the SHA against the reviewed PR head.

## Deployment gate
Production deployment remains a separate operation requiring explicit human approval, verified environment configuration, origin allow-list validation, pre-deployment checks, post-deployment smoke tests and rollback readiness. Configure required reviewers on a protected GitHub Environment before any future deployment workflow is introduced.
