# Database schema provenance

## Source classes

1. **Original migration** — SQL recovered from the commit/tag/backup that actually introduced the change.
2. **Ledger-recovered applied statement** — SQL statement payload read from `supabase_migrations.schema_migrations.statements`. It records what the database migration ledger stored as applied, but is not proof of byte identity with an original Git file.
3. **Reconstructed baseline** — SQL generated from a point-in-time schema export to reproduce current structure. It does not establish how the database historically reached that state.
4. **Contract fixture** — Synthetic schema used only for deterministic tests.
5. **Live observation** — Read-only catalog output captured from a named project and timestamp. It is evidence, not a migration.

Never mix these classes without explicit labels.

## Minimum catalog coverage

A schema snapshot intended for parity review should include:

- schemas and extensions;
- relations, columns, data types, nullability, defaults and generated/identity attributes;
- primary, foreign, unique and check constraints;
- indexes and validity state;
- views and materialized views;
- functions and procedures, identity arguments, return types, language, volatility, security-definer flag, configuration/search_path;
- function and schema privileges, including PUBLIC and role grants;
- RLS enabled/forced state and policies (roles, command, USING, WITH CHECK);
- triggers and trigger functions;
- enum and domain types;
- sequences and ownership;
- storage-related policies only when in scope.

Do not export table rows, credentials, API keys, auth tokens, or secret values.

## Evidence record

Record project reference (not credentials), capture timestamp with timezone, tool/version, query revision, database role used, and SHA-256 of the exported artifact. Store snapshots as restricted engineering artifacts. Review diffs before committing any snapshot; remove environment-specific identifiers and sensitive metadata.

## Verified live state — 2026-11-20

Read-only capture from Ashaa-INX (`vepacoemkhudamfaccah`), PostgreSQL 17.11:

- 14 public application tables observed; all 14 have RLS enabled.
- 19 applied migration ledger records observed.
- All 19 ledger entries have exactly one stored SQL statement payload.
- All 19 payloads were restored under `supabase/migrations/` on the recovery branch and independently compared against the stored ledger strings: 19/19 exact string matches.
- SHA-256 checksums are recorded in `docs/database/MIGRATION-LEDGER-RECOVERY-MANIFEST.json`.
- Original Git blob equivalence remains NOT VERIFIED.
- Four public function overloads were observed. The Phase 4N.8B candidate RPC `simula_transition_workflow_step` is absent from the live public function catalog and is not recorded in the applied ledger.
- `public.billing_webhook_events` has RLS enabled and zero policies; observed table grants are limited to postgres and service_role.
- `authenticated` has SELECT privilege on `public.platform_api_keys.key_hash`; treat this as a least-privilege issue requiring review, not an already-applied fix.

The file `docs/database/live-schema-metadata.snapshot.json` is a **partial public-schema catalog evidence capture**, not a canonical bootstrap or complete pg_dump. It excludes application rows and secret values. Additional triggers, views, enum/domain, schema-level ACL, extension and storage-policy inventory remains outstanding.

## Release rule

No baseline is authoritative until a reviewer confirms its provenance and a clean-database reconstruction has passed schema parity checks.
