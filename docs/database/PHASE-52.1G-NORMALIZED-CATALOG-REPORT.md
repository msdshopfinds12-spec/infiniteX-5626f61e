# Phase 52.1G — Normalized live catalog capture

## Status

- Read-only capture: **COMPLETED for the explicitly listed public-schema catalog scope**
- Historical definition comparison: **MATCH for compared objects after policy-command normalization**
- Contract V2: **BLOCKED / NOT ESTABLISHED**
- Production migration or deployment: **NOT AUTHORIZED**

## Capture identity

- Project: `Ashaa-INX` (`vepacoemkhudamfaccah`)
- PostgreSQL: `17.11`
- Captured at: `2026-11-20T14:54:23.029113+00:00`
- Schema scope: application-owned `public` schema
- No application rows, secret values, Vault contents, or function bodies were collected.

## Captured inventory

| Catalog class | Count |
|---|---:|
| Public tables | 14 |
| Columns | 132 |
| Constraints | 85 |
| Indexes | 44 |
| RLS policies | 19 |
| Routines | 4 |
| Non-internal triggers | 6 |
| Extensions | 7 |
| Sequences | 1 |
| Table grants | 219 |
| Column grants | 1250 |
| Routine grants | 12 |
| Sequence grants | 4 |
| Selected role memberships | 16 |
| Selected role attributes | 5 |
| Migration ledger entries | 19 |

## Historical comparison

The historical snapshot was captured at `2026-11-20T02:07:20.142926+00:00`. The live catalog was captured later at `2026-11-20T14:54:23.029113+00:00`; this is not a simultaneous snapshot.

| Compared class | Missing | Extra | Changed |
|---|---:|---:|---:|
| Columns | 0 | 0 | 0 |
| Indexes | 0 | 0 | 0 |
| Constraints | 0 | 0 | 0 |
| Policies (after command normalization) | 0 | 0 | 0 |
| Routines (selected metadata) | 0 | 0 | 0 |
| RLS flags | — | — | 0 |

Policy command normalization maps PostgreSQL catalog abbreviations `r/a/w/d/*` to `SELECT/INSERT/UPDATE/DELETE/ALL`. The initially reported 19 policy differences were representational only; after normalization there are **0** changed policies.

Migration ledger: historical 19; live 19; ordered version/name list equal: **YES**.

Routine execute grant comparison differences: **0** for the historical snapshot's selected anon/authenticated/service_role flags.

## Interpretation and limitations

The compared columns, indexes, constraints, policies, selected routine metadata, and RLS flags match the historical snapshot after normalization. This is strong evidence for those object classes, but it is not a canonical full-schema acceptance.

Current table/column grants, selected role memberships/attributes, extension metadata, sequence metadata and grants are captured as new evidence; the historical snapshot does not contain a complete comparable baseline for all of them. Function bodies, default privileges, complete cross-schema dependencies, and a canonical clean-room migration replay remain outside this capture.

The capture is metadata-only. It does not include application data or secrets. The complete machine-readable inventory and comparison are linked below.

## Artifacts

- [Normalized live catalog JSON](./PHASE-52.1G-NORMALIZED-LIVE-CATALOG.json)
- [Historical comparison JSON](./PHASE-52.1G-SCHEMA-DIFF.json)

## Acceptance gate

- Read-only catalog capture for listed scope: **PASS**
- Compared definition classes: **MATCH**
- Grant baseline comparison: **NOT AVAILABLE**
- Canonical schema contract: **NOT ESTABLISHED**
- Migration replayability: **NOT ESTABLISHED**
- Contract V2: **BLOCKED**
- Live migration / deployment / merge: **NOT AUTHORIZED**

## Safety record

- Database writes: **None**
- Migrations applied: **None**
- Schema changes: **None**
- Deployment or merge: **None**
- PR #76: **Untouched**
