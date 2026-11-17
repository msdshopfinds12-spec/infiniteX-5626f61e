# Phase 4M.2C — Worker Security and CI Enforcement

**Status:** implementation committed to an isolated GitHub branch; latest CI verification pending.  
**Base:** `fix/phase-4m2b-edge-worker-hardening` at `f30e42576a76e50a39f9a275ff05d1adb6edcc1c`.  
**Branch:** `fix/phase-4m2c-deno-tenant-isolation`.  
**Scope:** repository source and CI only. No production deployment, database migration, SQL/RLS/grant change, secret read/write, billing activation, or merge.

## Implemented

- Added `supabase/functions/_shared/worker-security.mjs`, a runtime-neutral module shared by Deno Edge Functions and Node's built-in test runner.
- Added strict claimed-run shape validation and authenticated-owner matching.
- Added parent-workflow identity and owner matching.
- Added safe integer batch-limit normalization.
- Added streaming JSON body parsing with an actual byte-count limit, including requests that omit or falsify `Content-Length`.
- Integrated these policies into both authenticated and cron workflow workers; applied the streamed request-body limit to the API-key manager.
- Added Node and Deno-native tests for malformed records, cross-owner rejection, parent workflow mismatch, batch-limit boundaries, malformed JSON, empty bodies, and oversized streamed payloads.
- Added the Node policy tests and a separate Deno CI job to the existing frontend CI workflow.
- The Deno job uses Deno `v2.9.8` and a SHA-pinned `denoland/setup-deno` action; it runs native tests and type-checks all three changed Edge Functions.
- Added the new branch to the workflow's push and pull-request branch filters.
- Extended the source-security scanner to require the shared policy integration points.

## Verification boundary

The Deno-native test file and CI job are committed, but the latest workflow run has **not yet been observed**. Earlier successful CI on commit `5e716a2` does not prove the new Deno job passes.

The current test suite validates pure policy behavior and verifies source integration patterns. It is not a live multi-tenant integration test and does not prove database-level isolation.

## Still blocked / not tested

- Deno-native tests and Edge Function type-checks are now wired into CI; their result remains pending until a workflow run for the latest commit completes.
- The implementation and grants of `simula_claim_workflow_runs`, `simula_claim_workflow_runs_internal`, and `simula_verify_worker_secret` still require SQL-level inspection.
- Verify database foreign keys, unique constraints for `workflow_step_runs(run_id, step_id)`, table grants, RLS policies, and service-role access boundaries.
- Add real Supabase integration tests with separate test users and synthetic records before claiming end-to-end tenant isolation.
- Verify deployed Edge Function source against repository snapshots before any production release.
- Review retry semantics, queue claim concurrency, idempotency, and failure recovery under concurrent workers.

## CI contract

The existing CI remains least-privilege and SHA-pinned. The Deno job adds one SHA-pinned setup action, requires no credentials or secrets, and uses free GitHub-hosted runner capacity within the repository's existing Actions allowance.

Required next evidence:
1. GitHub Actions run on this branch completes successfully.
2. Review test output and fix any failures on this branch.
3. Inspect SQL function definitions and grants without modifying them.
4. Add isolated integration coverage before production readiness is considered.

## Release gate

This branch is not approved for merge or deployment merely because CI passes. Human review and explicit release approval remain required. Production origins, secrets, database permissions, and deployment configuration must be independently verified.
