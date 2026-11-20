# Phase 52.1M — Schema Contract V2 source-readiness and safe completion plan

## Executive result

**Current CI blocker is understood and correctly fail-closed.** The failure is not a SQL migration replay defect. The offline gate reports:

- Migration integrity exit code: `0` (PASS).
- Contract snapshot exit code: `2` (BLOCKED).
- Current committed `supabase/contracts/database-contract.snapshot.json` declares `schemaVersion: 1`.
- The validator requires `schemaVersion: 2` and refuses to infer or upgrade legacy evidence.

The correct fix is a fresh, complete V2 read-only catalog capture, followed by independent review. Do not change the validator to accept V1, do not edit the version field manually, and do not set `reviewStatus: APPROVED` to make CI green.

## Evidence inspected

| Source | Observed evidence | Engineering interpretation |
|---|---|---|
| `supabase/contracts/database-contract.snapshot.json` | `schemaVersion: 1`, `reviewStatus: PENDING_HUMAN_REVIEW` | Current CI input is legacy and intentionally blocked |
| `scripts/check-database-contract.mjs` | Requires schemaVersion 2; validates capture scope, metadata classes, schema/table/function/role metadata and reviewer attestation | Correct fail-closed behavior; do not weaken |
| `supabase/contracts/capture-database-contract.readonly.sql` | Emits V2; one metadata-only SELECT; scope includes `public` and `private`; review status is pending; project ref is deliberately unverified | Correct candidate capture mechanism; must be executed against the approved read-only source |
| `docs/database/PHASE-52.1G-NORMALIZED-LIVE-CATALOG.json` | Public-schema point-in-time artifact captured 2026-11-20T14:54:23.029113+00:00; 15 relations, 132 columns, 85 constraints, 44 indexes, 19 policies, 4 routines, 6 triggers, 7 extensions, 19 migration ledger entries | Valuable evidence, but not a replacement for the V2 capture |
| `docs/database/PHASE-52.1G-NORMALIZED-CATALOG-REPORT.md` | Explicitly states V2 BLOCKED; public-only scope; private schema, default privileges and partition dependency graph not captured | Confirms material completeness gaps |
| `docs/database/PHASE-51.6L-COMPLETE-CATALOG-CONTRACT.md` | Documents V2 contract semantics, human review, project identity verification and safe capture procedure | Use as the governing capture specification |

## Why the existing artifacts cannot be promoted

1. The committed contract snapshot is V1, not V2.
2. The Phase 52.1G normalized artifact is explicitly public-schema-only. It does not establish the required public + private schema scope.
3. Phase 52.1G marks default privileges and the partition dependency graph as not captured.
4. The Phase 52.1G capture is point-in-time evidence and is not definition-by-definition proof of every V2 contract field.
5. The existing V2 SQL emits `PENDING_HUMAN_REVIEW` and `UNVERIFIED_MANUAL_ENTRY_REQUIRED` by design. A reviewer must verify the source project identity and inspect the resulting metadata before approval.
6. Structural validation is not schema parity. The approved snapshot must still be reconciled with canonical migration provenance and the disposable replay.

## Safest completion sequence

### 52.1M-A — Prepare the capture

- Inspect the entire `capture-database-contract.readonly.sql` before execution.
- Use an authorized read-only database session against the intended Supabase project.
- Confirm the project identity independently; never infer the project ref from `current_database()`.
- Run only the single SELECT. Do not add DDL, DML, GRANT, REVOKE, extension installation, or mutation statements.
- Do not collect application rows, function bodies, secrets, Vault values, or credentials.

### 52.1M-B — Validate the raw capture

- Save the exact JSON result without hand-editing catalog fields.
- Confirm `schemaVersion: 2`, the expected project ref, capture timestamp, PostgreSQL version and database role.
- Confirm `capture.scopeSchemas` includes `public` and `private`.
- Confirm every required metadata category is present and every prohibited-read/write flag is false.
- Run `node scripts/check-database-contract.mjs`; expect exit 2 while review is pending, not PASS.
- Inspect the full artifact for sensitive literals before committing.

### 52.1M-C — Human review and approval

- Compare project identity, schema scope, roles, grants, RLS policies, SECURITY DEFINER metadata, search_path, triggers, extensions and custom types.
- Compare the capture with the recovered migration sources and disposable replay.
- Record reviewer identity, timestamp and durable review evidence only after actual review.
- Set `reviewStatus: APPROVED` only when all review criteria are met. Do not fabricate reviewer identity or approval.

### 52.1M-D — Re-run CI

- Commit the sanitized reviewed V2 artifact to this branch.
- Re-run the database contract workflow on the exact commit.
- Require migration provenance, integrity, side-effect audit, read-only catalog tests, validator tests, disposable PostgreSQL security tests and migration replay to pass.
- Keep the PR draft until independent review and explicit merge authorization.

## Acceptance criteria

| Gate | Required evidence | Current status |
|---|---|---|
| Migration source integrity | Verified recovered migration manifest and provenance | PASS in current PR run |
| V2 capture exists | Fresh output from the V2 read-only SQL | BLOCKED / NOT YET CAPTURED |
| Source identity | Independently verified project ref | PENDING |
| Scope completeness | public + private and all required V2 metadata classes | PENDING |
| Human review | Reviewer identity, timestamp and durable evidence | PENDING |
| Contract validator | Exit 0 on the reviewed V2 artifact | BLOCKED |
| Catalog parity | Definition-level reconciliation with migration/replay evidence | NOT ESTABLISHED |
| Production migration / deployment | Separate explicit approval | NOT AUTHORIZED |

## Safety boundary

This phase performs repository documentation only. It does not access the live database, modify schema, read application data, change secrets, run production migrations, merge the PR, deploy, or alter billing.

## Reproducible local checks after capture

```sh
node --check scripts/check-database-contract.mjs
node --test tests/database/check-database-contract.test.mjs
node scripts/check-database-contract.mjs
```

The validator must remain BLOCKED until the exact V2 capture has been independently reviewed and approved. A failing gate is preferable to a false green status.
