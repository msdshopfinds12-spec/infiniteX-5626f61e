# InfiniteX database migration recovery

## Objective

Restore a reviewable, reproducible database source of truth without changing the live Supabase project. This workstream is deliberately separate from production migration execution.

## Current evidence boundary — 2026-11-20

The active Ashaa-INX project is PostgreSQL 17.11 and reports 19 applied application migrations. The important recovery breakthrough is that `supabase_migrations.schema_migrations` stores a non-empty `statements` array for every one of the 19 records.

Those statement payloads were restored to `supabase/migrations/` on the recovery branch. All 19 recovered file contents were independently fetched from GitHub and compared with the live ledger strings: **19/19 exact string matches**. SHA-256 values and per-version provenance are in `docs/database/MIGRATION-LEDGER-RECOVERY-MANIFEST.json`.

These are **ledger-recovered applied statements**, not proven byte-identical copies of the original historical Git files. The ledger has no rollback SQL bodies. No recovered file is approved for replay against production.

The separate Phase 4N.8B transactional step-fencing migration remains a candidate only: its version `20261120000000` is absent from the applied ledger and its RPC is absent from the live public function catalog. Do not treat the candidate as deployed.

The read-only public catalog capture found 14 public tables, all with RLS enabled. It also identified a no-policy service-only webhook table and authenticated SELECT access to the API-key hash column; details are in the Phase 4N.20 report.

## Recovery sequence

1. Freeze schema-changing work on the recovery branch until source provenance is established.
2. Preserve the read-only live catalog metadata snapshot and its timestamp/provenance. Exclude row data, secrets, auth credentials, and application records.
3. Preserve the exact migration ledger versions, names, statement payloads, and SHA-256 checksums.
4. Search branches, tags, PR refs, release archives, and authorized backups for original Git files; compare content and mark original-Git equivalence separately.
5. Review all 19 ledger-recovered SQL files for correctness, environment-bound values, and safe replay behavior. Do not replay them against source production.
6. Build a disposable PostgreSQL 17 rehearsal database and test the recovered chain from an empty database.
7. Compare rehearsal catalog against the live metadata snapshot, including tables, columns, types, defaults, constraints, indexes, triggers, policies, functions, grants, extensions, and relevant schema settings.
8. Reconcile the Phase 4N.8B candidate migration separately. Require schema compatibility, concurrency tests, and independent review before proposing it.
9. Run database contract tests against disposable/local PostgreSQL and a local Supabase stack where available.
10. Obtain human review before any production migration. This PR does not authorize production writes.

## Required provenance record

For each recovered or reconstructed artifact record:

| Field | Required meaning |
|---|---|
| artifact_path | Exact repository path |
| artifact_kind | original-migration, ledger-recovered-applied-statement, reconstructed-baseline, or test-fixture |
| source | Git commit, database ledger/project ref, or authorized backup |
| source_sha256 | SHA-256 of the source artifact |
| related_ledger_versions | Exact versions, or explicitly none |
| original_git_equivalence | verified, not_verified, or not_applicable |
| review_status | unreviewed, reviewed, or rejected |
| limitations | Known gaps and assumptions |

## Acceptance criteria

- Every live ledger entry is represented by a ledger-recovered statement file with matching SHA-256.
- Original Git equivalence is separately established or explicitly marked NOT_VERIFIED.
- The reconstructed baseline is visibly distinguished from historical migration statements.
- A clean disposable database can be built from the approved source set.
- Schema and RPC contracts match the reviewed live snapshot.
- No production write, migration, secret change, merge, or deployment is performed by CI.

## Rollback and recovery

This branch only adds repository evidence and offline validation. Revert its commits or close the draft PR to undo the repository proposal. Production rollback planning is separate and must be based on actual migration and data-change semantics; do not assume every DDL operation is reversible.
