# Database schema provenance

## Source classes

1. **Original migration** — SQL recovered from the commit/tag/backup that actually introduced the change.
2. **Reconstructed baseline** — SQL generated from a point-in-time schema export to reproduce current structure. It does not establish how the database historically reached that state.
3. **Contract fixture** — Synthetic schema used only for deterministic tests.
4. **Live observation** — Read-only catalog output captured from a named project and timestamp. It is evidence, not a migration.

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

## Known initial state

The current handoff reports 14 public tables inspected with RLS enabled, three workflow RPCs, and 19 applied migration records. Those counts are reported observations and must be re-queried before being treated as current. Exact function overload signatures and complete table/policy definitions remain to be captured.

## Release rule

No baseline is authoritative until a reviewer confirms its provenance and a clean-database reconstruction has passed schema parity checks.
