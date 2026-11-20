# Phase 51.6K — Retry and Timeout Contract Provenance

**Status:** STATIC SOURCE INVENTORY COMPLETE — AUTHORITATIVE LIVE CONSTRAINTS NOT VERIFIED  
**Date:** 2026-11-20  
**Related:** PR #63 (domain policy), PR #54 (migration recovery), PR #69 (contract reconciliation)

## 1. Why this gate exists

The retry-policy domain helper currently rejects `retryLimit > 10`. The worker runtime currently validates step timeouts in the 1–300 second range. Prior live-schema inspection notes reported a database timeout constraint of 1–3600 seconds.

These values must not be mistaken for one reconciled, authoritative contract. The domain helper is pure TypeScript and cannot prove the live database's constraints or existing data distribution.

## 2. Recovered migration inventory finding

A static search was performed across all 19 SQL statement files listed in `docs/database/MIGRATION-LEDGER-RECOVERY-MANIFEST.json` on the PR #54 recovery branch.

- No `retry_limit` token was found in the 19 recovered migration bodies.
- No `timeout_seconds` token was found in the 19 recovered migration bodies.
- The only `workflow_steps` match was a table privilege reference in migration `20261025204429_restrict_workflow_table_client_privileges.sql`.

This does not prove that the live columns or constraints do not exist. The recovered ledger is not established as the complete historical schema source, and some workflow objects may predate or exist outside these 19 recovered statements.

## 3. Current evidence boundaries

| Contract item | Current evidence | Status |
|---|---|---|
| Domain retry helper max retry limit = 10 | Source code and unit tests in PR #63 | VERIFIED AS CODE, NOT AS DATABASE CONTRACT |
| Retry limit database CHECK constraint | Not found in the 19 recovered SQL statements | NOT VERIFIED |
| Existing live retry_limit values | No complete approved catalog/data audit | NOT TESTED |
| Worker timeout validator 1–300 seconds | Worker source inspection | VERIFIED AS CODE |
| Live timeout constraint 1–3600 seconds | Earlier partial live-schema inspection note | PARTIAL; needs authoritative snapshot |
| Timeout values above 300 seconds in existing rows | No approved read-only data inventory | NOT TESTED |

## 4. Required reconciliation before implementation

1. Capture the authoritative table column and CHECK-constraint definitions for `workflow_steps` from an authorized, read-only database session.
2. Confirm the exact data type, nullability, default, and permitted range of `retry_limit` and `timeout_seconds`.
3. If authorized, produce aggregate-only counts of existing timeout values above 300 seconds. Do not export workflow inputs, outputs, or user data.
4. Confirm whether `retry_limit` counts retries after the initial attempt or total attempts. Preserve the documented domain semantics only after product/schema agreement.
5. Decide one explicit bound and apply it consistently to the database contract, runtime validator, API validation, generated types, and tests.
6. If the chosen bound changes existing data compatibility, propose a separate additive/compatibility migration and rollback strategy. Do not silently clamp existing values.

## 5. Safe alternatives

- **Preferred:** preserve current production behavior and defer any constraint change until the exact live contract and data distribution are reviewed.
- **Compatibility-first:** introduce validation at the trusted enqueue boundary using the currently verified runtime range, without altering existing database constraints; only if this does not reject legitimate existing configurations.
- **Migration-based:** change database and runtime bounds together in a separately reviewed migration after inventory and disposable replay.
- **Rejected:** silently change `retry_limit` maximum, clamp timeout values, or reinterpret run claim generation as step retry count.

## 6. Acceptance criteria

- Authoritative catalog snapshot explicitly records the column and CHECK definitions.
- Existing-value aggregate is reviewed where needed.
- Retry semantics and maximum are agreed and covered by boundary tests.
- Runtime and database timeout bounds are reconciled.
- Migration replay and compatibility tests pass in a disposable environment.
- No existing production row is modified as part of this documentation gate.

## 7. Safety boundary

This report is based on source inspection of recovered migration files and existing worker/domain code. It does not claim a complete schema audit. No SQL was executed, no database was queried or modified, and no migration, grant, RLS, secret, deployment, merge, or release action was performed.
