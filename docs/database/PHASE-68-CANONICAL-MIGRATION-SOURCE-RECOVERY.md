# Phase 68 — Canonical Migration Source Recovery

**Source branch:** `engineering/phase-64c-schema-contract-v2`  
**Target branch:** `engineering/infinitex-canonical-integration-candidate`  
**Status:** Ledger-recovered artifacts restored; disposable PostgreSQL replay, concurrency contract, and candidate quality gates PASS on commit `37863d751532e8293a0a4f69c9fb16d1a7b7c278`.

## Recovery finding

The 19 applied migration statements were not absent from the repository. They existed on the historical engineering recovery branch. This phase restores the exact source blobs and associated provenance/test artifacts into the active candidate branch.

## Provenance classification

- 19 SQL files are **ledger-recovered applied statements**.
- The recovery manifest records migration version, path, statement count, and SHA-256.
- The recovery report records exact statement-string matches against the live migration ledger for all 19 statements.
- Original historical Git-file equivalence remains **NOT_VERIFIED**.
- The 20th SQL file, `20261120120000_harden_platform_api_key_column_access.sql`, remains separately classified as `PROPOSED_NOT_APPLIED`, `NOT_VERIFIED_LIVE`, and `NOT_GRANTED` for production approval.
- The reconstructed five-table workflow baseline is a noncanonical disposable fixture, not a migration and not a production bootstrap.

## Prior disposable replay evidence

Phase 52.1L documents a previous PostgreSQL 17 disposable replay in which all 19 recovered statements and the separately classified candidate migration executed successfully. The replay job succeeded, while the enclosing workflow had a separate offline contract-gate failure. This is historical evidence for identical source artifacts at an earlier head, not a fresh replay of this candidate branch.

## Candidate verification

The candidate-specific workflow `.github/workflows/infinitex-phase-68-database-replay.yml` runs the migration rehearsal and disposable security tests against an isolated PostgreSQL 17 container. A successful run on the current candidate head is required before claiming current-head replay verification.

## Safety boundary

- Never point the replay harness at hosted Supabase.
- Never apply recovered SQL to production as a repair; these statements are already represented in the live ledger.
- Never promote the reconstructed fixture to a migration.
- No hosted DDL/DML, secrets, cron, grants, billing, deployment, or merge changes are authorized by this phase.

## Exact candidate-head CI evidence

- [Push disposable replay, row-lock concurrency, lease recovery, generation fencing, and security suite — SUCCESS](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44795384056)
- [PR disposable replay, row-lock concurrency, lease recovery, generation fencing, and security suite — SUCCESS](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44795393676)
- [Push candidate quality gates — SUCCESS](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44795384077)
- [PR candidate quality gates — SUCCESS](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44795393670)

The concurrency test runs only against the isolated PostgreSQL 17 replay database with synthetic rows. It deliberately holds the oldest queue row in one database session, verifies a separate service-role claim skips that row, then verifies the released row can be claimed at a distinct attempt generation. It also verifies 15-minute lease recovery, terminal failure at attempt 5, unique step-run identity, and stale-generation terminal update rejection.

This is real database-session evidence, but not a high-volume stress test or proof of deployed Edge Function behavior.
