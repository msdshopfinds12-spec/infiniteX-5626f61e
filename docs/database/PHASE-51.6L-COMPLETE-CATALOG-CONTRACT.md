# Phase 51.6L — Complete read-only database contract

Version 2 replaces the previous partial catalog contract for the \`public\` and \`private\` application schemas. The SQL is one SELECT over PostgreSQL system catalogs. It does not read application rows, function bodies, credentials, webhook payloads, decrypted Vault values, or secret stores. It performs no DDL, DML, GRANT, REVOKE, extension installation, scheduler changes, or network calls.

## Captured metadata

- Schema owners and schema grants.
- Tables, partitioned tables, views, materialized views, foreign tables, and sequences; relation owners and RLS/FORCE RLS flags.
- Column ordinal, name, formatted type, default expression, nullability, identity/generated markers, and collation.
- Constraint definitions, validation, and deferrability.
- Index definitions and unique/primary/valid/ready flags.
- RLS policies and expressions.
- Relation-level and column-level grants.
- Non-internal trigger definitions and enabled state.
- Function/procedure overload identity, owner, language, result type, volatility, parallel-safety, strict/leakproof flags, SECURITY DEFINER, search_path, and EXECUTE roles. Function bodies are neither read nor emitted; no body fingerprint is generated.
- Installed extensions/versions, custom enum/domain/range/multirange types, non-internal role attributes, and role memberships.

Role password hashes, application rows, function bodies, and arbitrary comments are excluded. Default expressions and policy/constraint/index/trigger definitions are schema metadata; inspect them for embedded literals before sharing.

## Fail-closed versioning

- Validator requires \`schemaVersion: 2\`; v1 is BLOCKED pending a fresh capture, never upgraded by inference.
- Query emits \`PENDING_HUMAN_REVIEW\` and blank reviewer fields.
- Project identity is emitted as \`UNVERIFIED_MANUAL_ENTRY_REQUIRED\`. Set \`projectRef\` only after independently verifying the Supabase project identity; \`current_database()\` is not a project ref.
- Validator returns exit code 2 while human approval is pending.
- Approval requires reviewer identity, valid timestamp, and durable evidence.
- Structural validity is not schema parity or security proof. Reconcile with recovered migration sources and disposable PostgreSQL replay.

## Safe procedure

1. Prefer a disposable PostgreSQL 17 database.
2. Inspect the complete SQL; it must remain one SELECT.
3. Export the single \`database_contract_snapshot\` JSON result.
4. Keep it local until metadata is reviewed for sensitive literals.
5. Verify projectRef independently and compare with migration/RPC evidence.
6. Never change PENDING to APPROVED merely to satisfy CI.
7. Commit only a reviewed, sanitized snapshot in a separate reviewable change.

Catalog visibility depends on the executing role. Record and review \`databaseRole\`; the role inventory excludes built-in \`pg_*\` roles and is not a full cluster access audit.

## Validation

\`\`\`sh
node --check scripts/check-database-contract.mjs
node --test tests/database/check-database-contract.test.mjs
node scripts/check-database-contract.mjs
\`\`\`

The final command should remain BLOCKED until a complete v2 snapshot has been independently captured and explicitly approved. This PR performs no production database access.
