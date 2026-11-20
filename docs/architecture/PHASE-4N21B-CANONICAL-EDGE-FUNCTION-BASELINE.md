# Phase 4N.21B — Canonical Edge Function Source Baseline

## Purpose
This is an isolated, main-based draft remediation candidate. It introduces the reviewed Edge Function source and security-test foundation from the Phase 4N.8A candidate. It does not merge or deploy these functions.

## Provenance
- Base branch: `main`
- Source branch: `fix/phase-4n8a-attempt-fencing`
- Reviewed source commit: `a7e81d5165222e25acba0c296f2ebc6dd4feec22`
- Source PR: #34
- The files in this branch are candidate source, not proof of parity with the currently deployed Supabase functions.

## Included
- API-key manager, regular workflow worker, and cron worker source.
- Shared CORS and worker-security modules.
- Node/Deno security regression tests.
- Isolated Phase 4N.7 and Phase 4N.8A GitHub Actions workflows.
- Architecture and verification-gate documentation.
- Package scripts for focused Edge Function security tests.

## Critical release blockers
1. Deployed function source previously retrieved from Supabase differed from tracked candidate source. This branch does not deploy or claim to resolve production drift.
2. Historical SQL bodies for the 19 migration ledger entries remain unverified. Do not reconstruct or apply guessed SQL.
3. RPC signatures, table constraints, grants, RLS policies, and schema compatibility must be established from authoritative sources before database-dependent rollout.
4. Application-level attempt-generation checks do not prove transactional fencing unless the database operation atomically checks and advances the generation under the correct lock/condition.
5. In-process retries are not durable retries. Persistent scheduling, backoff, lease expiry, and recovery require a verified persistence contract.
6. A cooperative timeout is not hard preemption. External work must honor cancellation or be isolated behind a bounded execution mechanism.

## Required validation before merge
- Run `npm ci`.
- Run `npm run lint` and `npm run build`.
- Run `npm run test:edge-function-security`.
- Validate Phase 4N.7 and Phase 4N.8A workflows on this branch's exact head commit.
- Validate CORS behavior, request size limits, JWT handling, ownership checks, and cron secret verification.
- Test duplicate claims, stale attempt completion, lease expiry, retry persistence, and concurrent workers against a disposable PostgreSQL/Supabase environment with authoritative schema.
- Review dependency audit output and deployment configuration.
- Obtain human review and explicit release approval.

## Safety boundaries
- No production database migration.
- No Supabase function deployment.
- No secrets or environment-variable changes.
- No merge, auto-merge, release, or production traffic change.
- No paid infrastructure or preview deployment requirement added intentionally.

## Status
Isolated draft candidate. CI, database compatibility, deployed parity, and production behavior must be independently verified on this branch before it can be considered merge-ready.
