# Phase 52.1A — Migration provenance hardening

## Scope and safety boundary

This change is repository-only and offline. It does not connect to Supabase, read secrets, execute SQL, apply migrations, alter production data, or change deployment configuration.

## Provenance model

- **Ledger-recovered applied statement:** one of the 19 entries recorded in the recovered migration ledger manifest. This classification records repository evidence; it is not a fresh live-database check.
- **Proposed candidate:** a SQL file that exists in the repository but has no verified live-ledger evidence. It must remain explicitly marked `PROPOSED_NOT_APPLIED`.
- **Unclassified SQL file:** any migration file that is not listed in either authoritative classification source. The validator fails closed.

The existing 19-entry recovered manifest remains unchanged. The additional API-key column-hardening SQL is recorded in `MIGRATION-PROVENANCE-CLASSIFICATION.json` with `NOT_VERIFIED_LIVE` and `NOT_GRANTED` production approval.

## Controls added

1. A provenance validator checks exact file coverage, disjoint versions/paths, safe paths, candidate status fields, and SHA-256 values.
2. Regression tests cover untracked files, duplicate/overlapping versions and paths, missing files, and attempted candidate promotion.
3. The database-contract workflow runs the provenance validator and its tests before the existing recovered-manifest checks.
4. Existing offline-only CI and production-safety messaging remain intact.

## Acceptance criteria

- Exactly 19 entries remain in the recovered applied ledger manifest.
- Every SQL file is classified exactly once as applied-ledger-recovered or candidate.
- Candidate SQL is never counted as applied and cannot pass validation if marked live-verified or production-approved without a deliberate reviewed change to this policy.
- SHA-256 matches every classified SQL file.
- No production credentials, database connections, migration execution, merge, or deployment are introduced.

## Limitations

Static repository checks cannot prove current production state, PostgreSQL privilege semantics, original Git blob equivalence, SQL execution safety, or schema parity. Those require separate disposable PostgreSQL testing and independent review in later phases.
