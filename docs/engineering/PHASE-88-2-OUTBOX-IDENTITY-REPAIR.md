# Phase 88.2 Repair — Canonical Outbox Identity

## Scope

This repair tightens the workflow completion outbox identity contract to match the PostgreSQL schema already defined by the candidate transactional outbox migration.

## Root cause

The earlier TypeScript contract accepted arbitrary non-empty strings up to 200 characters for `runId` and `stepId`, then concatenated them with colon separators. This permitted delimiter ambiguity and could accept component values whose combined key exceeded the database limit. The SQL contract stores both identifiers as PostgreSQL `uuid` values and the attempt as PostgreSQL `integer`.

## Chosen repair

- Require canonical lowercase UUID strings for run and step identities.
- Require attempts to be positive safe integers within PostgreSQL's signed 32-bit integer range.
- Generate the existing deterministic key format only from validated UUIDs and bounded attempts.
- Keep the existing key format for valid database identities; no persisted-key migration or key-version transition is introduced.
- Keep validation fail-closed and preserve the exact three-field payload allowlist.

## Why this strategy

The database schema is the source of truth. Aligning the TypeScript boundary with that schema eliminates colon-bearing identifiers and bounds key length without introducing asynchronous hashing, a new key version, or a persisted-data compatibility migration.

This approach is valid only while the database identity columns remain UUID and attempt remains integer. If those column types change, the event identity contract and its compatibility tests must be revised together.

## Regression coverage added

- Use UUID-shaped fixtures for valid event identities.
- Reject delimiter-bearing and non-UUID identifiers.
- Reject attempts above PostgreSQL integer maximum.
- Verify deterministic key generation at the maximum valid attempt.
- Verify generated keys remain within the database's 200-character limit.
- Preserve completion helper forwarding and identity-mismatch tests.

## Safety boundaries

- No SQL migration was changed or applied.
- No production database was queried or modified.
- No provider delivery, dispatcher activation, cron scheduling, secret changes, merge, or deployment was performed.
- Existing persisted keys for valid UUID-based identities retain the same format.

## Verification still required

- Exact-head GitHub Actions for this repair branch.
- Review of all event-construction call sites and test output.
- Disposable PostgreSQL integration coverage for concurrent idempotency conflicts and complete dispatcher lifecycle.
- Separate production-state verification and approval before any migration or live integration.
