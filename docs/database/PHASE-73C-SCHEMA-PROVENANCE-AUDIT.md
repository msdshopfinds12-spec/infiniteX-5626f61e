# Phase 73C — Schema Provenance and Backend Integrity Audit

**Audit mode:** GitHub repository artifact review only  
**Base:** `phase-71/worker-http-integration`  
**Base commit:** `94253f7bf0c5bbfb4d663696fcbf9ab077af7088`  
**Status:** PARTIAL — repository evidence reviewed; fresh live database inspection and complete schema parity are not performed by this phase.

## 1. Purpose

Establish a defensible source-of-truth boundary for InfiniteX database engineering before proposing production DDL, privilege changes, or worker deployment. Reuse existing Phase 68/69/71/63E evidence; do not reconstruct or replay already-applied migrations against hosted Supabase.

## 2. Repository evidence reviewed

| Artifact | Repository finding | Limitation |
|---|---|---|
| `docs/database/SCHEMA-PROVENANCE.md` | Defines original migration, ledger-recovered statement, reconstructed baseline, contract fixture, and live observation as separate source classes | Does not itself prove every catalog object is captured |
| `docs/database/MIGRATION-LEDGER-RECOVERY-MANIFEST.json` | Records 19 applied ledger entries and checksums | Original historical Git blob equivalence remains NOT_VERIFIED |
| `docs/database/MIGRATION-PROVENANCE-CLASSIFICATION.json` | Separately classifies the API-key column grant candidate as PROPOSED_NOT_APPLIED | Classification is repository evidence, not a fresh live ledger query |
| `docs/database/live-schema-metadata.snapshot.json` | Partial public-schema metadata snapshot; 14 tables represented | Not a canonical bootstrap or complete catalog export |
| `docs/engineering/INFINITEX-LIVE-SCHEMA-RLS-BASELINE-2026-11-20.md` | Documents RLS and column-privilege observations | One table-count sentence conflicted with its own 14-table inventory; corrected from 13 to 14 in this branch |
| `docs/engineering/SUPABASE-RUNTIME-AND-SCHEMA-VERIFICATION.md` | Documents live worker/runtime observations and deployed-versus-candidate drift | Historical read-only report; not refreshed by this branch |
| `docs/database/PHASE-68-CANONICAL-MIGRATION-SOURCE-RECOVERY.md` | Documents 19/19 ledger statement matches and disposable replay evidence | Not proof of original Git migration-file identity or current production parity |
| `docs/engineering/PHASE-71-WORKER-INTEGRATION.md` | Documents HTTP boundary tests and worker source behavior | Stateful mock is not deployed Edge Function/PostgreSQL end-to-end evidence |

## 3. Corrections and findings

### 3.1 Table-count consistency

The live RLS baseline's summary said 13 public tables, while its inventory enumerated 14. The schema provenance and runtime verification artifacts also describe 14 public tables. This branch corrects the stale summary sentence to 14.

This is a documentation reconciliation based on the checked-in artifact inventory. It is not a new live catalog query.

### 3.2 Migration provenance

Keep the 19 migration records classified as ledger-recovered applied statements. The manifest documents exact statement-string matches against the stored migration ledger and SHA-256 values. Do not relabel them as original historical Git files until original blob equivalence is proven.

The API-key column-access migration remains a candidate classified PROPOSED_NOT_APPLIED / NOT_VERIFIED_LIVE / NOT_GRANTED. Do not apply it from this audit.

### 3.3 Snapshot completeness

The checked-in schema metadata snapshot is explicitly partial. Outstanding catalog coverage includes, at minimum:

- all schemas and extension versions;
- complete columns, defaults, generated/identity attributes and constraints;
- index validity and definitions;
- views and materialized views;
- functions/procedures, overload identity arguments, configuration, volatility and SECURITY DEFINER state;
- schema/function/table/column privileges including PUBLIC and role inheritance;
- RLS enabled/forced state and complete policy expressions;
- triggers and trigger functions;
- enums, domains, sequences and ownership;
- relevant storage policies.

No row data, secrets, tokens, API keys, or credential values should be added to the evidence artifact.

### 3.4 Worker/runtime drift is a release blocker

The existing runtime verification report records material differences between deployed Edge Function source and candidate Git source, including attempt-generation fencing and request-body/origin hardening. Preserve that as an independent release blocker. A green GitHub workflow does not establish deployed runtime parity.

## 4. Required next verification sequence

1. Obtain a fresh, read-only catalog export from the named Supabase project with capture timestamp, timezone, database role, query revision, and artifact SHA-256.
2. Compare all catalog dimensions listed in Section 3.3 against the checked-in snapshot and generated TypeScript types.
3. Independently reconcile the current migration ledger versions and stored statement payloads against the manifest; do not execute migrations on the hosted project.
4. Search historical Git refs/tags/authorized archives for each original migration file and record exact blob equivalence or NOT_VERIFIED.
5. Review function grants, table/column grants, RLS, SECURITY DEFINER search paths, triggers, and service-role-only paths.
6. Reconcile deployed Edge Function versions with the selected candidate source using a file-by-file diff.
7. Produce a separate least-privilege and worker-rollout proposal only after the evidence is complete.
8. Require isolated PostgreSQL/Supabase rehearsal, independent review, explicit human approval, and a rollback/recovery plan before any production write.

## 5. Safety and scope

- Repository-only changes: documentation correction and this audit report.
- No hosted Supabase DDL/DML, GRANT/REVOKE, RLS change, migration, secret access/change, cron change, or Edge Function deployment.
- No Vercel deployment, billing change, merge, or release.
- Do not treat this branch as a canonical production schema baseline.
- Do not mark Phase 73C complete until the live catalog, historical migration provenance, grants, and runtime parity are independently reconciled.

## 6. Acceptance criteria

Phase 73C may be marked VERIFIED only when:

- the complete live catalog artifact is captured and integrity-hashed;
- all migration ledger entries and repository SQL files have unambiguous provenance classifications;
- original Git equivalence is verified or explicitly documented as unavailable per migration;
- clean disposable PostgreSQL reconstruction passes;
- reconstructed schema parity is checked against the complete live catalog;
- grants, RLS, triggers, and function security boundaries are reviewed;
- deployed worker/runtime parity is documented with exact versions and hashes;
- an independent reviewer signs off on the evidence.

Until then, status remains PARTIAL / NOT RELEASE-READY.
