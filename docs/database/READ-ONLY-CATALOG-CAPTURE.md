# Read-only database contract capture

## Purpose and scope

`supabase/contracts/capture-database-contract.readonly.sql` produces one JSON value named `database_contract_snapshot` from PostgreSQL system catalogs. It is a **metadata inventory**, not a schema dump, migration, proof of schema parity, or approval of the live database.

The capture declares the application-schema scope as `public` and `private`. It inventories:

- Schema names, owners, and schema grants.
- Relations in those schemas, including relation kind, owner, RLS-enabled and FORCE RLS flags.
- Column names, ordinals, formatted types, defaults, nullability, identity/generated attributes, and collation.
- Constraint definitions and validation/deferrability attributes.
- Index definitions and uniqueness/primary/valid/ready flags.
- RLS policy names, commands, roles, USING expressions, and WITH CHECK expressions.
- Relation-level and column-level grants, including grantor, grantee, privilege, and grant option.
- Non-internal trigger names, enabled state, and trigger definitions.
- Function/procedure overload identity, owner, language, result type, SECURITY DEFINER flag, configured search_path, volatility, parallel-safety, strict/leakproof flags, and EXECUTE roles. Function bodies are not selected.
- Installed extension names, schemas, and versions; enum/domain/range/multirange type metadata.
- Non-system role attributes and non-system role memberships. These role inventories are cluster-wide catalog metadata, not limited to the two application schemas.

The validator in `scripts/check-database-contract.mjs` requires schemaVersion 2 and the declared metadata categories: `schemas`, `tables`, `columns`, `constraints`, `indexes`, `table_grants`, `column_grants`, `rls_policies`, `triggers`, `functions`, `extensions`, `custom_types`, `role_attributes`, and `role_memberships`.

## Read-only and data-minimization boundary

The SQL is authored as one metadata-only SELECT statement (using CTEs). It does not intentionally read application table rows, function bodies, API keys, webhook payloads, decrypted Vault values, database passwords, or service secrets. It does not issue DDL, DML, GRANT, REVOKE, extension installation, scheduler changes, or network calls.

**Review the query and its output before sharing either.** Catalog expressions such as column defaults, constraint/index definitions, policy expressions, and trigger definitions are metadata, but may contain literals or identifiers that should not be published. Sanitize only through a documented, reviewable process; do not silently omit required categories or alter evidence in a way that makes the snapshot misleading.

## Capture procedure

1. Confirm you are authorized to inspect the intended Supabase project's database metadata.
2. Open the correct project and verify its project reference from the trusted project context. Do not infer `projectRef` from `current_database()`, a database name, a branch label, or this repository.
3. Open the SQL Editor and create a new, unsaved query.
4. Paste the exact contents of `supabase/contracts/capture-database-contract.readonly.sql`.
5. Inspect the statement. Confirm it remains a single read-only metadata query and does not contain added statements.
6. Execute it once and export/copy the single `database_contract_snapshot` JSON value.
7. Preserve the raw capture separately. Review catalog visibility, scope, unexpected metadata, and possible embedded literals before preparing a sanitized repository artifact.
8. Reconcile the reviewed capture with migration provenance, disposable replay results, existing schema evidence, and relevant RPC/security contracts.
9. Record the capture timestamp, executing database role, verified project reference, any visibility limitations, and the exact source revision used for the query.
10. Submit the candidate snapshot for independent human review. Do not replace the committed snapshot merely because the JSON is structurally valid.

A disposable PostgreSQL execution can validate SQL behavior and shape, but it is **not** a live Ashaa-INX capture and cannot establish the live project's identity or schema parity.

## Project identity and review state

The SQL deliberately emits:

- `schemaVersion: 2`;
- `projectRef: UNVERIFIED_MANUAL_ENTRY_REQUIRED`;
- `reviewStatus: PENDING_HUMAN_REVIEW`;
- blank `review.reviewedBy`, `review.reviewedAt`, and `review.reviewEvidence`;
- all four safety flags as `false`: `applicationRowsRead`, `functionBodiesRead`, `secretsRead`, and `writeStatementsExecuted`.

Replace the project-reference placeholder only after independently verifying the intended project identity. Keep the review status pending until a human reviewer has examined provenance, catalog visibility, grants, RLS policies, routine overloads and security metadata, triggers, extensions, custom types, roles, memberships, and reconciliation evidence.

The validator accepts only `APPROVED` or `PENDING_HUMAN_REVIEW`. An `APPROVED` snapshot must include non-empty reviewer identity, a valid review timestamp, and review evidence. Never set `APPROVED` merely to make CI green. Structural validity is necessary but does not prove that the captured schema matches the intended production schema.

## Limitations and interpretation

- This is a catalog metadata inventory, not a full schema dump. It does not capture application rows, function bodies, storage objects, scheduler job definitions, network configuration, or secret values.
- PostgreSQL catalog visibility depends on the executing role and platform permissions. Missing or partially visible objects must be documented as a limitation; do not treat an incomplete capture as authoritative.
- The role and role-membership sections intentionally include non-system roles beyond `public` and `private`; inspect the output for sensitive role names before publication.
- The SQL records only a function's configured `search_path` setting. An empty value means no matching per-function setting was found; it is not proof that a SECURITY DEFINER routine is safe.
- Function signatures and security attributes do not reveal routine implementation behavior because function bodies are not read.
- Extension metadata is cluster-level inventory filtered by the SQL's extension catalog query; it is not an allowlist or a recommendation to install extensions.
- A catalog snapshot is time-bound. Schema changes after capture make it stale and require a new capture.
- The committed V1 snapshot is historical evidence and must not be relabeled as V2. A genuine V2 capture requires executing the current SQL in the authorized target environment and independently reviewing the result.

## File and readiness contract

The SQL output is intended to satisfy the structural shape checked by `scripts/check-database-contract.mjs`. The validator fails closed when the snapshot is legacy/incomplete, has an unverified project reference, violates required metadata/safety fields, or has not received the required human approval.

The current repository snapshot remains `schemaVersion: 1` / `PENDING_HUMAN_REVIEW` until a genuine, reviewed V2 capture is prepared. This documentation update does not modify that snapshot, run the SQL against the hosted project, approve the contract, or remove the readiness gate.
