# Phase 52.1F — Schema reconciliation assessment

## Status

- Classification: `PRELIMINARY_RECONCILIATION_ASSESSMENT`
- Overall status: **PARTIAL — NOT ACCEPTED**
- Canonical schema contract: **No**
- Contract V2 readiness: **NOT ESTABLISHED**
- Production migration authorization: **NOT GRANTED**
- Release approval: **NOT GRANTED**
- Source evidence: Phase 52.1E live catalog evidence and the repository's historical `live-schema-metadata.snapshot.json`
- Project: `Ashaa-INX` (`vepacoemkhudamfaccah`), PostgreSQL 17.11, `ap-northeast-2`

## Executive result

The historical snapshot and the Phase 52.1E live catalog evidence have matching aggregate object counts:

| Catalog object | Historical snapshot | Live evidence | Result |
|---|---:|---:|---|
| Public tables | 14 | 14 | Aggregate match |
| Columns | 132 | 132 | Aggregate match |
| Constraints | 85 | 85 | Aggregate match |
| Indexes | 44 | 44 | Aggregate match |
| Policies | 19 | 19 | Aggregate match |
| Routines | 4 | 4 | Aggregate match |
| Non-internal triggers | 6 | 6 | Aggregate match |
| Migration ledger entries | 19 | 19 | Aggregate match |

**This is not a schema-parity pass.** Equal counts do not prove that the same objects exist or that their definitions, privileges, dependencies, ownership, or behavior are equivalent.

Definition-level parity, a complete missing/extra/changed-object report, deterministic snapshot hash comparison, and canonical clean-room migration replay remain **NOT ESTABLISHED**. This assessment deliberately does not invent a zero-difference result.

## Scope and interpretation

The assessment uses the Phase 52.1E evidence artifact and the repository's existing historical metadata snapshot. Phase 52.1E explicitly describes itself as preliminary and states that it did not persist every catalog definition as a complete normalized artifact.

The existing snapshot is historical evidence. Its capture-time equivalence to the Phase 52.1E live catalog was not established. Aggregate counts are useful as a coarse consistency signal, but cannot detect a same-count replacement, changed expression, changed grant, altered policy predicate, or different dependency.

## Security observations carried forward

- All 14 inventoried public tables have RLS enabled.
- None of the 14 tables has FORCE ROW LEVEL SECURITY enabled.
- `authenticated` has SELECT privilege on `public.platform_api_keys.key_hash`; `anon` does not.
- The candidate migration `20261120120000_harden_platform_api_key_column_access.sql` is **NOT APPLIED** to the live project.
- `anon` and `authenticated` do not have the observed SELECT or INSERT table privileges on `public.billing_webhook_events`.
- `authenticated` does not have the observed direct UPDATE privilege on `public.profiles.role`.

RLS being enabled is not a complete security proof. Policy predicates, grants, ownership, role membership/inheritance, routine execution context, and actual role behavior still require review.

## Required definition-level reconciliation

The next complete capture and comparison must include:

1. **Relations:** schema, name, kind, owner, persistence, partition attributes, RLS and FORCE RLS.
2. **Columns:** ordinal, type, collation, nullability, defaults, generated and identity attributes.
3. **Constraints:** names, types, normalized definitions, validation, deferrability and initially-deferred state.
4. **Indexes:** normalized definitions, uniqueness, validity, readiness, predicates and included columns.
5. **Policies:** commands, roles, USING expressions and WITH CHECK expressions.
6. **Privileges:** table and column grants, role membership and inherited privilege context.
7. **Routines:** identity arguments, return type, language, volatility, SECURITY DEFINER status, search_path and execute grants.
8. **Views:** normalized definitions and security-invoker/security-barrier attributes.
9. **Triggers:** timing, events, enabled state, function binding and definition.
10. **Extensions:** name, version and installation schema.
11. **Migration provenance:** ledger versions, available checksums/content hashes, source paths and repository provenance.
12. **Dependencies:** foreign keys, referenced objects, routine/view dependencies and ownership.

Sensitive values, application rows, credentials, and Vault contents must remain excluded. Function source should be reviewed only when required for security or behavioral verification and should not be copied into public evidence artifacts without a clear need.

## Blockers

- Phase 52.1E is a point-in-time evidence summary, not a complete normalized catalog export.
- Same-time/same-state equivalence between the historical snapshot and the latest live evidence is unproven.
- Aggregate count equality cannot establish object-level parity.
- The Phase 52.1D reconstructed baseline remains a disposable fixture, not canonical production migration history.
- Historical Git-blob equivalence for recovered migration statements remains unestablished.
- Phase 52.1E intentionally excluded function source bodies and the complete role membership/inherited privilege graph.
- Canonical clean-room migration replay against an independently verified reference schema has not been accepted.

## Ordered next actions

### P0 — Fresh normalized capture

Capture the application-owned `public` schema through read-only catalog queries. Use one consistent transaction or document the repeatable capture window. Record the project ref, PostgreSQL version, capture timestamp, query/tool provenance and completeness manifest.

**Acceptance:** every in-scope object has a stable identity and complete normalized definition; excluded object classes are explicitly listed.

### P0 — Definition-level diff

Compare the fresh capture against the historical snapshot and the migration-derived expected state.

**Acceptance:** emit machine-readable `missing`, `extra`, `changed`, and `uncomparable` collections. A count-only match must never pass this gate.

### P0 — Security semantics review

Review RLS policy expressions, grants, ownership, role inheritance, SECURITY DEFINER routines, search_path and execution context.

**Acceptance:** positive and negative role-behavior tests pass in a disposable environment. Do not infer security from catalog flags alone.

### P1 — Migration provenance and clean-room replay

Establish canonical migration sources and replay them in a disposable database from a known starting point.

**Acceptance:** the resulting normalized catalog matches the reviewed reference, with provenance and replay evidence attached.

### P1 — Contract V2 generation

Generate the canonical Contract V2 artifact only after capture completeness, definition-level reconciliation, provenance and review gates pass.

**Acceptance:** the repository validator accepts the exact artifact and a reviewer approves the full diff.

### P1 — API-key privilege hardening

Keep the existing candidate migration separately gated. Perform a fresh disposable rehearsal, regression checks, and rollback planning before requesting separate explicit approval for any live application.

## Acceptance gate

| Gate | State |
|---|---|
| Aggregate count comparison | PASS — preliminary only |
| Definition-level schema parity | NOT ESTABLISHED |
| Migration provenance | PARTIAL |
| Capture repeatability | NOT ESTABLISHED |
| Canonical clean-room replay | NOT ESTABLISHED |
| Contract V2 | BLOCKED |
| Production migration | NOT AUTHORIZED |
| Merge / deployment / release | NOT AUTHORIZED |

## Safety and change record

- Database writes: **None**
- Live migrations applied: **None**
- Schema changes: **None**
- Application rows collected: **None**
- Secret values collected: **None**
- Deployment performed: **No**
- PR #76 modified: **No**
- This Phase 52.1F artifact is documentation only.

## Machine-readable companion

See [`PHASE-52.1F-SCHEMA-RECONCILIATION.json`](./PHASE-52.1F-SCHEMA-RECONCILIATION.json).
