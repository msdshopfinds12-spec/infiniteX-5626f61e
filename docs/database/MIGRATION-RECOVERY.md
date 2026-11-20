# InfiniteX database migration recovery

## Objective

Restore a reviewable, reproducible database source of truth without changing the live Supabase project. This workstream is deliberately separate from production migration execution.

## Evidence boundary

The engineering handoff reports 19 applied migration records in the active Supabase project and no `supabase/migrations/` directory on the inspected `main` and backend integration branches. A separate Phase 4N.8B branch contains a candidate transactional step-fencing migration. These are distinct facts:

- The 19 live migration records have not yet been matched to original SQL files.
- The Phase 4N.8B migration is a candidate change, not proof of historical coverage.
- A schema export is a reconstruction of current state, not original migration history.
- Synthetic PostgreSQL fixtures are not a substitute for a Supabase production catalog export.

Do not label reconstructed SQL as an original migration or invent migration versions.

## Recovery sequence

1. Freeze schema-changing work on the recovery branch until source provenance is established.
2. Export a read-only schema snapshot from the active project using an authorized, least-privilege inspection method. Exclude row data, secrets, auth credentials, and application records.
3. Retrieve the migration ledger (version, name, and execution metadata) independently from the database catalog. Preserve the exact returned values.
4. Search all repository branches, tags, PR refs, release archives, and authorized backups for matching original SQL.
5. Match every ledger version to an original file by version and content evidence. Record missing, duplicate, renamed, and unverifiable entries.
6. If original SQL cannot be recovered, create a clearly labeled baseline reconstruction from the reviewed schema snapshot. Keep it in a separate baseline directory or explicitly designated baseline branch; never backdate it as historical migrations.
7. Reconcile the baseline against a clean disposable database. Compare tables, columns, types, defaults, constraints, indexes, triggers, policies, functions, grants, extensions, and relevant schema settings.
8. Run database contract tests against disposable/local PostgreSQL and a local Supabase stack where available.
9. Obtain human review before any production migration. This PR does not authorize production writes.

## Required provenance record

For each recovered or reconstructed artifact record:

| Field | Required meaning |
|---|---|
| artifact_path | Exact repository path |
| artifact_kind | original-migration, reconstructed-baseline, or test-fixture |
| source | Git commit, database export identifier, or authorized backup |
| source_sha256 | SHA-256 of the source artifact |
| related_ledger_versions | Exact versions, or explicitly none |
| review_status | unreviewed, reviewed, or rejected |
| limitations | Known gaps and assumptions |

## Acceptance criteria

- Every live ledger entry is either matched to original SQL or explicitly marked unrecovered.
- The reconstructed baseline is visibly distinguished from historical migrations.
- A clean disposable database can be built from the approved source set.
- Schema and RPC contracts match the reviewed snapshot.
- No production write, migration, secret change, merge, or deployment is performed by CI.

## Rollback and recovery

This branch only adds documentation and offline validation. Revert its commits or close the draft PR to undo the repository proposal. Production rollback planning is a separate task and must be based on the actual migration and data-change semantics; do not assume every DDL operation is reversible.
