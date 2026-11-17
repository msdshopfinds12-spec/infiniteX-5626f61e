# Phase 4M.2C — Worker Security and CI Enforcement

**Status:** implementation committed to an isolated GitHub branch; GitHub Actions run #144 passed all three jobs.  
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

GitHub Actions run #144 completed successfully on commit `e0d275fc98c5b20d28c209f00b540340f97b8bfd`. All three jobs passed: Node policy/typecheck/unit tests/dependency audit/production build; Playwright and axe browser accessibility tests; and Deno-native worker tests plus Edge Function type-checks.

The current test suite validates pure policy behavior and verifies source integration patterns. It is not a live multi-tenant integration test and does not prove database-level isolation.

## Still blocked / not tested

- Live synthetic two-user tenant-isolation integration tests remain NOT TESTED.
- Queue concurrency, retries/idempotency, and stale lease recovery remain NOT LOAD-TESTED.
- The implementation and grants of `simula_claim_workflow_runs`, `simula_claim_workflow_runs_internal`, and `simula_verify_worker_secret` still require SQL-level inspection.
- Verify database foreign keys, unique constraints for `workflow_step_runs(run_id, step_id)`, table grants, RLS policies, and service-role access boundaries.
- Add real Supabase integration tests with separate test users and synthetic records before claiming end-to-end tenant isolation.
- Verify deployed Edge Function source against repository snapshots before any production release.
- Review retry semantics, queue claim concurrency, idempotency, and failure recovery under concurrent workers.

## CI contract

The existing CI remains least-privilege and SHA-pinned. The Deno job adds one SHA-pinned setup action, requires no credentials or secrets, and uses free GitHub-hosted runner capacity within the repository's existing Actions allowance.

Required next evidence:
1. Preserve run #144 as the current successful CI evidence.
2. Inspect SQL function definitions and grants without modifying them.
3. Add isolated synthetic multi-user integration coverage before production readiness is considered.
4. Verify deployed Edge Function source parity before any separately approved release.

## Release gate

This branch is not approved for merge or deployment merely because CI passes. Human review and explicit release approval remain required. Production origins, secrets, database permissions, and deployment configuration must be independently verified.
