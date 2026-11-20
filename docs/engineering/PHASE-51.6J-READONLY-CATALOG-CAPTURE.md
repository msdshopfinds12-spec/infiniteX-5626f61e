# Phase 51.6J — Read-only Catalog Contract Capture

**Status:** QUERY AND STATIC REGRESSION TESTS VERIFIED BY CI — LIVE CAPTURE NOT RUN  
**Date:** 2026-11-20  
**Implementation PR:** #54  
**Related review PR:** #69

## 1. Deliverables

PR #54 now contains:
- `supabase/contracts/capture-database-contract.readonly.sql`
- `docs/database/READ-ONLY-CATALOG-CAPTURE.md`
- `tests/database/catalog-capture-readonly.test.mjs`

The query emits the current validator's required JSON structure:
- schema version;
- `reviewStatus: PENDING_REVIEW`;
- blank reviewer fields;
- UTC capture timestamp and provenance;
- `public` / `private` base-table names, RLS flags, and policy metadata;
- function overload identity, SECURITY DEFINER flag, per-function search_path setting, and EXECUTE roles.

It is one read-only catalog SELECT. It does not query application table rows, API-key records, webhook payloads, decrypted Vault values, or invoke cron/pg_net.

## 2. CI evidence and correction

The first exact-head run #40 (`44734860371`) caught a defect in the new regression test: splitting SQL on semicolons incorrectly treated semicolons inside dollar-quoted function text as separate statements. The SQL query was not the cause.

The test was corrected to assert the CTE/SELECT shape, one JSON-object projection, and absence of mutation statement starters without naïvely splitting SQL text.

Exact-head Run #44:
- Commit: `b136dc50113cf5270e1b3595d289623bb2710ce0`
- Read-only capture regression tests: PASS (3/3).
- Recovered migration SHA-256 manifest: PASS (19/19).
- Side-effect policy scan and tests: PASS.
- Existing database contract, API-key privilege, and migration integrity tests: PASS.
- Production-safety invariant: PASS.
- Final merge-blocking source-readiness gate: BLOCKED/FAILURE because the contract snapshot is not yet explicitly human-approved.

This is an honest separation between test quality and source readiness. The final workflow is not green.

## 3. Human review process

The query intentionally returns `PENDING_REVIEW`. A reviewer must:
1. inspect the exact query before running it;
2. confirm the authorized project and capture role;
3. export the single JSON result;
4. compare its table/policy/function metadata with the sanitized live catalog evidence and migration ledger;
5. record missing visibility, drift, and unexplained differences;
6. only then decide whether the snapshot can be approved.

Do not fill reviewer fields or set `APPROVED` to bypass CI.

## 4. Known scope limits

This is not a full schema dump. It does not capture every column, constraint, index, trigger, extension, role attribute, storage object, or function body. Catalog visibility depends on the role executing the query. An empty search_path field records the absence of a per-function setting; it does not prove a SECURITY DEFINER function is safe.

The query has not been executed against Ashaa-INX by this change. It has not been executed against a disposable database either. SQL syntax/runtime compatibility remains NOT TESTED.

## 5. Next gates

1. Validate this query against a disposable PostgreSQL/Supabase environment.
2. Capture the authorized catalog snapshot and have a human review it.
3. Add only the reviewed, sanitized snapshot to PR #54.
4. Run the merge-blocking source-readiness gate again.
5. Separately implement no-egress/no-cron disposable replay for the 19 recovered migrations.

No production SQL, schema mutation, grants/RLS changes, secrets, deployment, merge, or release occurred.
