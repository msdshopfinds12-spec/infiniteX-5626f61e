# Phase 52.1E — Live catalog evidence (preliminary)

## Status

- Classification: `PRELIMINARY_LIVE_CATALOG_EVIDENCE`
- Canonical schema contract: **No**
- Contract v2 readiness: **NOT ESTABLISHED**
- Production changes authorized: **No**
- Capture mode: read-only PostgreSQL catalog inspection
- Captured: 2026-11-20 14:41:16 UTC
- Project: `Ashaa-INX` (`vepacoemkhudamfaccah`), PostgreSQL 17.11, `ap-northeast-2`

## Scope and evidence

The capture inventories the application-owned `public` schema and selected project-level metadata. It does not export application rows, secrets, Vault contents, function source bodies, or platform-managed schema definitions.

| Catalog area | Observed |
|---|---:|
| Public tables | 14 |
| Columns | 132 |
| Constraints | 85 |
| Indexes | 44 |
| Policies | 19 |
| Routines | 4 |
| Non-internal triggers | 6 |
| Applied migration ledger entries | 19 |

All 14 inventoried public tables have RLS enabled. None has FORCE ROW LEVEL SECURITY. This is a catalog fact, not proof that every policy and role combination is secure.

### Public tables

`billing_webhook_events`, `credit_ledger`, `payments`, `platform_api_keys`, `profiles`, `subscriptions`, `tools`, `usage_logs`, `user_projects`, `workflow_logs`, `workflow_runs`, `workflow_step_runs`, `workflow_steps`, and `workflows`.

### Extension inventory

- `pg_cron` 1.6.4
- `pg_net` 0.20.4
- `pg_stat_statements` 1.11
- `pgcrypto` 1.3
- `plpgsql` 1.0
- `supabase_vault` 0.3.1
- `uuid-ossp` 1.1

## Security-relevant privilege checks

### API-key hash exposure

Live catalog privilege check returned:

- `anon`: no SELECT on `public.platform_api_keys.key_hash`
- `authenticated`: SELECT is granted on `public.platform_api_keys.key_hash`

This is a verified least-privilege hardening finding. Owner-scoped RLS is still a separate row-level boundary; it does not make browser exposure of a verifier hash necessary. The existing candidate migration `20261120120000_harden_platform_api_key_column_access.sql` is **not applied** to the live project. Its application requires a separate explicit approval.

### Billing webhook events

The live privilege check found no SELECT or INSERT table privilege for either `anon` or `authenticated` on `public.billing_webhook_events`. This is consistent with the previously observed service-only access model. Do not add client policies merely to silence an advisor notice.

### Profile role

The live privilege check found no direct authenticated UPDATE privilege on `public.profiles.role`. Keep role assignment server-controlled.

## Migration provenance

The live `supabase_migrations.schema_migrations` ledger contains 19 entries. Their versions match the recovery manifest in `MIGRATION-LEDGER-RECOVERY-MANIFEST.json`.

The recovered SQL statements reproduce the applied ledger payloads, but historical Git-blob equivalence is not established. The Phase 52.1D workflow baseline remains a reconstructed disposable fixture, not canonical production schema history.

## Findings and next actions

1. **DB-KEYHASH-001 — verified:** remove browser SELECT on `key_hash` through a separately approved, rehearsed migration. Keep metadata access narrowly column-scoped.
2. **DB-WEBHOOK-001 — verified safe boundary:** preserve service-only webhook processing unless a documented use case and threat model justify another model.
3. **DB-ROLE-001 — verified:** preserve the server-controlled profile role boundary.
4. **DB-RLS-001 — review:** inspect policy predicates, grants, ownership, SECURITY DEFINER routines, and runtime role behavior. RLS enabled alone is insufficient.
5. **Phase 52.1F:** build a normalized, reproducible, complete catalog capture and reconcile it against the migration chain and existing v1 contract. Do not call this artifact authoritative v2.

## Explicit limitations

- This is a point-in-time evidence summary, not a canonical or exhaustive schema contract.
- The capture did not persist every column, constraint, index, policy, grant, routine, and trigger definition as a complete normalized artifact.
- Platform-managed schemas are intentionally excluded.
- No application rows or secret values were collected.
- No database write, migration, schema change, deployment, merge, or billing action was performed.
- Production migration and release approval remain **NOT GRANTED**.

## Machine-readable companion

See [`PHASE-52.1E-LIVE-CATALOG-EVIDENCE.json`](./PHASE-52.1E-LIVE-CATALOG-EVIDENCE.json).
