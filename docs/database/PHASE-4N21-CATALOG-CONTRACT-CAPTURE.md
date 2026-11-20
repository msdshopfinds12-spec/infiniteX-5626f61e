# Phase 4N.21 — Catalog Contract Capture and Human Approval Gate

**Date:** 2026-11-20 02:21:58.728459+00  
**Project:** Ashaa-INX (`vepacoemkhudamfaccah`)  
**PostgreSQL:** 17.11  
**Capture role:** postgres

## Capture evidence

- 14 public tables confirmed in the live catalog.
- All 14 have RLS enabled.
- Current policy counts were cross-checked against the earlier detailed table snapshot.
- 219 table-grant rows captured.
- 6 non-internal triggers captured.
- 10 public/private function overloads captured, including owner, return type, language, volatility, SECURITY DEFINER, search_path, EXECUTE roles, and MD5 definition fingerprint.
- 7 installed extensions recorded; no enum/domain types were observed in public/private.
- No application rows, API key values, credentials, or secret values were selected.

## Approval status

The canonical-path file `supabase/contracts/database-contract.snapshot.json` is deliberately marked `PENDING_HUMAN_REVIEW`. It is a captured evidence candidate, not an approved desired-state contract.

The validator now returns:
- exit 2 (BLOCKED) when the snapshot is missing or lacks explicit human approval;
- exit 1 (FAIL) for malformed or structurally invalid data;
- exit 0 (PASS) only after explicit review metadata is supplied and structure is valid.

## Security review flags

- `platform_api_keys`: authenticated has table-level SELECT. Review column-level exposure of `key_hash`; no grant was changed.
- `billing_webhook_events`: RLS enabled with zero policies and observed table grants limited to postgres/service_role. Confirm service-only intent.
- Private `simula_claim_workflow_runs(p_limit integer)`: SECURITY DEFINER with authenticated EXECUTE grant; its owner-bound authorization logic requires manual body review.
- Public `set_updated_at()`: EXECUTE includes PUBLIC; it is trigger-returning. Confirm exposure is acceptable and no alternate invocation path is exploitable.

## Capture limitations

Column, constraint, index and policy definitions reuse the earlier read-only catalog capture. Current relation count, RLS state and policy counts were checked against live metadata. A fresh definition-by-definition comparison, full schema ACL inventory, clean-database replay and schema parity rehearsal remain outstanding.

## Safety

No production DDL/DML, grants, migration application, secret reads, merge, deployment or billing action occurred.
