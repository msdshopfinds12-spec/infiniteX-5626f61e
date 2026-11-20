# Phase 52.1H — Migration provenance and replay assessment

## Executive decision

**Recovered ledger payloads: verified. Original Git source provenance: NOT ESTABLISHED. Canonical clean-room replay: NOT ESTABLISHED. Production replay: NOT AUTHORIZED.**

This phase distinguishes three different claims that must not be conflated:

1. The recovered SQL files reproduce statements stored in the applied Supabase migration ledger.
2. Those recovered files are byte-identical to the original historical Git migration files.
3. The recovered migration chain can recreate the authoritative live schema from a genuinely empty, correctly provisioned PostgreSQL environment.

Only claim 1 is supported by the existing evidence.

## 1. Provenance evidence

- Recovery commit: [`6f4f6d7`](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/commit/6f4f6d73868c040ee32e0f779ba29bcfbd1e218c)
- Commit message: `recovery(database): restore 19 applied migration payloads from Supabase ledger`
- The commit introduces the recovery manifest and 19 SQL migration paths.
- The manifest identifies the source as a read-only extraction from `supabase_migrations.schema_migrations.statements`.
- All 19 manifest entries mark `original_git_blob_equivalence` as `NOT_VERIFIED`.
- The manifest marks the ledger-statement-to-recovered-file exact string match as verified.
- The recovered SQL file SHA-256 values were independently checked against the manifest in the preceding phase: 19/19 matched.

**Interpretation:** the files are integrity-checked recovered ledger payloads. They are not proven original source-control files. A checksum against a recovery manifest proves consistency with that manifest, not historical Git provenance.

## 2. Replay evidence

Existing Phase 52.1D workflow evidence (GitHub Actions run [#44753723123](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44753723123)) reports:

- 19 recovered migrations replayed in a disposable Supabase PostgreSQL 17.6.1.136 container.
- A separately classified `RECONSTRUCTED_DISPOSABLE_FIXTURE` supplied missing workflow-domain tables before later migrations.
- Disposable PostgreSQL security behavior tests and catalog execution passed.
- A candidate API-key column-privilege migration was separately rehearsed in the disposable database.
- The final merge-blocking source-readiness gate remained blocked because the authoritative v2 catalog contract was not established.

**Replay classification: PASS WITH RECONSTRUCTED DISPOSABLE FIXTURE.**

This is not a canonical empty-database replay. The fixture was derived from an older noncanonical metadata snapshot and is explicitly not a canonical migration or proof of original live bootstrap equivalence. A successful replay with that fixture cannot establish that the recovered chain alone reconstructs the authoritative production schema.

## 3. Evidence matrix

| Claim | Result | Reason |
|---|---|---|
| 19 ledger payloads recovered | PASS | Recovery manifest identifies ledger source |
| Recovered file hashes match manifest | PASS | 19/19 previously checked |
| Recovered files equal original Git blobs | NOT ESTABLISHED | No trusted original historical blobs verified |
| Rollback SQL available | NOT AVAILABLE | Ledger recovery contains no rollback bodies |
| Disposable replay with reconstructed fixture | PASS | Existing CI evidence |
| Canonical empty-database replay | NOT ESTABLISHED | Depends on reconstructed noncanonical baseline |
| Authoritative schema parity | NOT ESTABLISHED | No canonical replay baseline |
| Contract V2 | BLOCKED | Source readiness and human review gate remain |
| Production migration | NOT AUTHORIZED | Requires separate approval |

## 4. Safe next sequence

1. Search the repository's reachable historical commit trees and any trusted backup for original versions of all 19 migration paths.
2. If an original source blob is found, compare its exact bytes and Git blob identity with the recovered file. If no trusted original exists, preserve the status as `NOT_ESTABLISHED`.
3. Obtain an authoritative bootstrap baseline from a trusted source. Do not promote the reconstructed disposable fixture.
4. Create a fresh disposable PostgreSQL 17 environment with required platform extensions and prerequisites pinned and documented.
5. Replay only the reviewed source chain in timestamp order, recording each migration's result and failure boundary.
6. Capture the resulting normalized catalog and compare it with the independently captured authoritative live catalog.
7. Keep production migrations, PR merge, and deployment behind separate explicit human approvals.

## 5. Safety record

- Supabase database writes: **None**
- Live migrations: **None**
- GitHub Actions reruns: **None**
- Secrets or Vault values read: **None**
- PR #76 changed: **No**
- PR created: **No**
- Merge: **None**
- Deployment: **None**
- Billing changes: **None**

## Related artifacts

- [Recovery manifest](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/blob/engineering/phase-52-1g-normalized-catalog/docs/database/MIGRATION-LEDGER-RECOVERY-MANIFEST.json)
- [Phase 52.1G catalog report](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/blob/engineering/phase-52-1g-normalized-catalog/docs/database/PHASE-52.1G-NORMALIZED-CATALOG-REPORT.md)
- [PR #76](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/pull/76)
