# Phase 52.1K — Clean-room PostgreSQL 17 replay preparation

## Status

**PREPARATION DOCUMENTED — REPLAY NOT EXECUTED**

This phase prepares a reproducible, isolated rehearsal plan for the 19 ledger-recovered migration statements. It does not establish original Git provenance, approve a canonical bootstrap, or authorize any production database operation.

## Repository evidence inspected

- Repository: `msdshopfinds12-spec/infiniteX-5626f61e`
- Phase 52.1J investigation branch: `engineering/phase-52-1j-canonical-bootstrap-investigation`
- Phase 52.1K preparation branch: `engineering/phase-52-1k-clean-room-replay-preparation`
- Recovery branch: `recovery/infinitex-database-source-of-truth`
- Recovery branch tip inspected: `b136dc50113cf5270e1b3595d289623bb2710ce0`
- Recovery commit: `6f4f6d73868c040ee32e0f779ba29bcfbd1e218c`
- Recovery commit parent: `f315ed2e8cd749ee455ff26f091f12d1cab0143d`
- Recovered applied statement files: 19
- Parent tree migration paths: 0
- Ledger statement to recovered file matches: 19/19 as recorded in the existing recovery manifest/report
- Original Git blob equivalence: NOT ESTABLISHED

The recovery commit message identifies the payloads as restored from the Supabase migration ledger. Treat them as reconstructed recovery inputs, not proven original migration source.

## Existing validation assets

The recovery branch contains:
- `.github/workflows/database-contract.yml` — offline-only workflow; it does not perform a PostgreSQL replay.
- `scripts/verify-recovered-migration-manifest.mjs` — verifies the 19 recovered file SHA-256 values against the manifest.
- `scripts/check-migration-integrity.mjs` — filename, timestamp, duplicate-version, and basic file-integrity checks.
- `scripts/audit-migration-side-effects.mjs` — migration side-effect policy audit.
- `docs/database/MIGRATION-LEDGER-RECOVERY-MANIFEST.json` — recovery provenance and checksums.
- `docs/database/MIGRATION-RECOVERY.md` — recovery limitations and acceptance criteria.

These checks do not prove SQL executability, Supabase compatibility, or live schema parity.

## Phase 52.1K objective

Prepare a clean-room replay harness that:
1. Uses PostgreSQL major version 17 in a fresh disposable environment.
2. Has no production Supabase URL, database password, service-role key, or production network route.
3. Pins the exact source branch and commit SHA used for the run.
4. Verifies the recovery manifest before any SQL is executed.
5. Enumerates exactly the 19 manifest-listed SQL files in version order.
6. Executes with fail-fast semantics and captures per-file results.
7. Stops on the first SQL failure; never skips, edits, or silently retries a migration.
8. Captures PostgreSQL version, extensions, roles/prerequisite availability, execution logs, and final catalog metadata.
9. Destroys the disposable database/container after evidence export.
10. Reports any unavailable Supabase-specific prerequisite as BLOCKED rather than manufacturing a fake successful replay.

## Required preflight

Before execution:
- Review every SQL file and identify Supabase-specific roles, schemas, extensions, functions, network calls, Vault/cron dependencies, and environment-bound values.
- Confirm whether plain PostgreSQL 17 is sufficient. If not, use a pinned local Supabase-compatible PostgreSQL 17 stack or classify the run BLOCKED; do not create fake substitutes for security-sensitive platform behavior.
- Confirm that no workflow secret or production credential is referenced.
- Confirm the database is newly created and contains no application schema.
- Confirm the candidate hardening migration `20261120120000_harden_platform_api_key_column_access.sql` is excluded from the 19-file replay unless separately reviewed and explicitly added to a different test scenario.
- Preserve all original recovered SQL bytes; no automatic rewriting or normalization.

## Execution protocol

Suggested runner sequence, after SQL review and harness approval:

```bash
set -euo pipefail

node scripts/verify-recovered-migration-manifest.mjs
node scripts/check-migration-integrity.mjs
node scripts/audit-migration-side-effects.mjs

psql "$DISPOSABLE_DATABASE_URL" \
  --no-psqlrc --set ON_ERROR_STOP=1 \
  --command "SELECT version();"

# Execute manifest-listed files only, in ascending migration version order.
# The runner must use a disposable-only connection string and must not
# read or fall back to any production environment variable.
```

The final runner must parse the manifest, validate each path remains under `supabase/migrations/`, verify SHA-256 immediately before execution, and invoke `psql` separately for each file with `ON_ERROR_STOP=1`. It must not use shell glob expansion as the source of truth.

## Evidence required for Phase 52.1L

A replay is PASS only when the evidence bundle contains:
- Exact repository, branch, commit SHA, manifest SHA-256, and PostgreSQL 17 server version.
- Preflight output and dependency classification for every migration.
- 19/19 per-file execution results with durations and exit codes.
- Complete stdout/stderr logs, with secrets redacted.
- Final catalog export and extension/role inventory.
- A machine-readable result manifest and a clear PASS/FAIL/BLOCKED status.
- Confirmation that the disposable environment was destroyed.
- Confirmation that production database writes, migrations, merges, deployments, and billing changes were zero.

Any SQL error, missing required platform dependency, hash mismatch, unexpected source file, or unverified database target means FAIL or BLOCKED. No partial success may be described as a completed replay.

## Safety boundaries

- Production database: NO CONNECTION / NO WRITES.
- Production migrations: NOT AUTHORIZED.
- Merge: NOT AUTHORIZED.
- Deployment: NOT AUTHORIZED.
- Secrets reads or changes: NOT AUTHORIZED.
- Billing changes: NOT AUTHORIZED.
- Candidate hardening migration: EXCLUDED from the 19-entry historical replay.
- Schema Contract V2: BLOCKED until replay and exact catalog parity evidence are independently reviewed.

## Phase gates

| Phase | Deliverable | Exit condition |
|---|---|---|
| 52.1K | This clean-room preparation and dependency review | Harness and source set approved |
| 52.1L | Disposable PostgreSQL 17 replay | Actual 19/19 execution evidence |
| 52.1M | Replay-vs-live catalog parity | Exact structural comparison and discrepancy review |

## Current decision

**Phase 52.1K preparation record: DOCUMENTED.**
**Phase 52.1L replay: NOT RUN.**
**Canonical bootstrap: NOT ESTABLISHED.**
**Production replay: NOT AUTHORIZED.**

Do not claim a replay, successful migration execution, or schema parity until the actual isolated PostgreSQL run and evidence bundle exist.
