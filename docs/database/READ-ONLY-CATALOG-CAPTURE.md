# Read-only database contract capture

## Purpose

Capture only PostgreSQL catalog metadata needed by the current offline contract validator. The query reads table/RLS/policy metadata and function overload/security-definer/search-path/EXECUTE-role metadata for the `public` and `private` schemas.

It does **not** read application rows, API keys, webhook payloads, decrypted Vault values, database passwords, or service secrets. It contains one SELECT statement and performs no DDL, DML, GRANT, REVOKE, extension installation, scheduler changes, or network calls.

## Procedure

1. Open the Ashaa-INX Supabase project only if you are authorized to review its schema.
2. Open the SQL Editor and create a new, unsaved query.
3. Paste the contents of `supabase/contracts/capture-database-contract.readonly.sql`.
4. Inspect the query before running it. It must remain read-only.
5. Run it once and export/copy the single `database_contract_snapshot` JSON value.
6. Save the value locally for review. Do not immediately commit it.
7. Compare the output with the existing sanitized catalog capture and the recovered migration/RPC evidence.
8. Confirm the capture contains no unexpected schemas or metadata before sharing it in a repository PR.

## Approval rules

The query intentionally emits:
- `reviewStatus: PENDING_REVIEW`;
- blank `review.reviewedBy`, `review.reviewedAt`, and `review.reviewEvidence`.

Do not change these fields to `APPROVED` merely to make CI green. Approval requires a human to review the capture provenance and reconcile its contents against the intended schema, grants, RLS policies, RPC overloads, SECURITY DEFINER settings, and migration history. The existing validator will continue to block the merge gate until this approval is explicit.

## Limitations

- This is a catalog snapshot, not a full schema dump.
- It currently captures tables and functions in `public` and `private`; it does not capture every constraint, index, trigger, extension, role attribute, or storage object.
- PostgreSQL catalog visibility depends on the executing role. An incomplete view must be labeled as partial, not treated as authoritative.
- `searchPath` is recorded as an empty string when no per-function setting is present; that is not proof that a SECURITY DEFINER function is safe.
- The SQL has not been executed against the live project by this change. Validate it in a disposable environment first when available.

## File contract

The returned JSON shape matches the structural fields currently required by `scripts/check-database-contract.mjs`. It remains `PENDING_REVIEW` until human approval.
