# Phase 52.1I — Historical migration source recovery

## Decision

**Historical source recovery: NOT ESTABLISHED. Original Git blob equivalence: NOT ESTABLISHED. Contract V2: BLOCKED.**

## Scope and observations

The 19 SQL paths recorded in the migration recovery manifest were checked against the repository's inspected default branch, `main`.

- Exact recovered migration paths present on `main`: **0 / 19**
- Exact recovered migration paths absent on `main`: **19 / 19**
- Exact filename commit-message search matches: **0**

The commit-message search is not a historical file-path search. A zero-result commit-message search cannot prove that a blob never existed in an earlier commit, tag, branch, or backup. A complete reachable commit-tree walk was not performed in this phase.

## What this proves—and what it does not

It proves only that the 19 recovered paths are not present at the inspected `main` ref.

It does **not** prove that:
- the files never existed in earlier repository history;
- no tags or other branches contain the original files;
- no trusted backup contains the original files;
- the recovered ledger payloads are byte-identical to original historical Git blobs.

The earlier recovery commit [`6f4f6d7`](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/commit/6f4f6d73868c040ee32e0f779ba29bcfbd1e218c) states that it restored 19 applied migration payloads from the Supabase ledger. This supports the classification **RECOVERED_LEDGER_PAYLOADS_ONLY**, not original Git source provenance.

## Evidence matrix

| Check | Result |
|---|---|
| 19 paths checked against `main` | PASS |
| Exact path presence on `main` | 0 / 19 |
| Exact filename commit-message search | No matches; non-exhaustive |
| All reachable refs and commit trees | NOT EXHAUSTIVELY INSPECTED |
| Trusted backup inventory | NOT AVAILABLE |
| Original Git blob equivalence | NOT ESTABLISHED |
| Canonical empty-database replay | NOT ESTABLISHED |
| Contract V2 | BLOCKED |

## Safe next steps

1. Enumerate all reachable refs and tags, then inspect historical commit trees for each exact migration path.
2. Record each candidate's commit SHA, tree path, Git blob SHA, and bytes.
3. Compare original bytes against recovered ledger payload bytes; report exact matches, divergences, and missing sources separately.
4. If repository history has no originals, inspect a trusted user-controlled backup or verified export. Do not treat the database ledger as proof of original Git provenance.
5. Establish an independently reviewed bootstrap baseline and replay only in a fresh disposable PostgreSQL environment.

## Safety record

- GitHub inspection: read-only
- Database writes: **None**
- Migrations applied: **None**
- Workflow reruns: **None**
- Secrets read: **None**
- PR #76 modified: **No**
- PR created: **No**
- Merge/deployment/billing changes: **None**

## Related evidence

- [Recovery commit](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/commit/6f4f6d73868c040ee32e0f779ba29bcfbd1e218c)
- [Recovery manifest](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/blob/engineering/phase-52-1g-normalized-catalog/docs/database/MIGRATION-LEDGER-RECOVERY-MANIFEST.json)
- [Phase 52.1H report](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/blob/engineering/phase-52-1h-migration-provenance/docs/database/PHASE-52.1H-MIGRATION-PROVENANCE-AND-REPLAY.md)
