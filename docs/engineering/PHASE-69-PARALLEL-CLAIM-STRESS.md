# Phase 69 — Parallel Claim and Duplicate Insert Stress Verification

**Scope:** disposable PostgreSQL 17 only. Synthetic owner/workflow/run/step records are created and deleted by the test harness. The workflow never connects to the hosted Supabase project.

## Implementation

- Script: `scripts/test-workflow-claim-stress.sh`
- Workflow: `.github/workflows/infinitex-phase-68-database-replay.yml`
- PostgreSQL target guard: requires `PGDATABASE=infinitex_rehearsal`; exits before writes for any other database name.

## Test contract

1. Seed 80 synthetic queued workflow runs.
2. Start 16 independent `psql` sessions concurrently.
3. Each session calls `private.simula_claim_workflow_runs_internal(5)` under `service_role`.
4. Assert exactly 80 claims, 80 unique run IDs, no duplicate IDs, and attempt generation 1 for every run.
5. Assert no seeded workflow run remains queued.
6. Launch two independent sessions concurrently to insert the same `(run_id, step_id)` pair with `ON CONFLICT DO NOTHING`.
7. Assert exactly one step-run row exists for the unique key.
8. Delete the synthetic owner (cascading fixture cleanup) and remove temporary result files.

## Exact candidate-head evidence

Candidate head: `aaf9bb1d3f16904ec07d5e32b1c495ec8010dd3a`

- [PR PostgreSQL replay + row-lock + parallel stress + security — SUCCESS](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44796503703)
- [PR quality gates — SUCCESS](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44796503555)
- [Push quality gates — SUCCESS](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44796492397)

Observed test log:
- 16 parallel PostgreSQL sessions claimed 80 distinct runs exactly once.
- Every claimed run advanced from attempt 0 to attempt 1.
- No seeded run remained queued.
- Simultaneous duplicate step-run inserts preserved the unique key.
- Existing row-lock, stale lease, max-attempt, generation-fencing, and security tests also passed.

## Limits

- This is a bounded 80-run / 16-session stress test, not a sustained production-load benchmark.
- The duplicate-insert check starts two independent sessions concurrently and verifies the unique invariant; it does not measure throughput or characterize all possible scheduler interleavings.
- The test exercises the database RPC directly, not the complete deployed Edge Function HTTP/auth/worker pipeline.
- No hosted Supabase writes, production migration, function deployment, secret/cron change, merge, or release occurred.

## Next gates

1. Expand to repeated randomized rounds and higher session counts with bounded CI timeouts.
2. Add true Edge Function adapter tests with a disposable Supabase-compatible environment.
3. Compare all relevant live catalog objects with the replayed candidate schema.
4. Verify deployed function source/version and operational configuration read-only.
5. Require explicit release approval before any production change.
