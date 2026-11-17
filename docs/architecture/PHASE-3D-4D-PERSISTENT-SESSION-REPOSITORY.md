# Phase 3D-4D — Persistent Session Repository Contract

Status: **ADAPTER SOURCE + CONTRACT TESTS COMMITTED; DATABASE NOT PROVISIONED**

## Implemented

- `src/auth/postgres-session-repository.mjs` accepts an injected pg-compatible client.
- SQL values are parameterized; no user-controlled SQL identifiers are accepted.
- Session creation stores the token digest and CSRF digest, never the raw session token.
- Active lookup requires `revoked_at IS NULL` and `expires_at > now`.
- Revocation is conditional on the session still being active and unexpired.
- Adapter input validation occurs before issuing SQL.
- Contract tests assert parameterized values and active-session predicates.
- No `pg` dependency, connection string, environment secret, migration, or live database call was introduced.

## Required future table contract

The adapter expects a table named `auth_sessions` with:

| Column | Required semantics |
|---|---|
| `id` | Generated primary key |
| `user_id` | Non-null FK to trusted identity table |
| `token_hash` | Non-null unique SHA-256 hex digest |
| `csrf_token_hash` | Non-null SHA-256 hex digest |
| `expires_at` | Non-null timestamptz |
| `revoked_at` | Nullable timestamptz |
| `created_at` | Non-null timestamptz |

Recommended constraints for a separately reviewed migration proposal:

- Unique index on `token_hash`.
- Index on `user_id` for session revocation by user.
- Index on `expires_at` for bounded cleanup.
- Check that token and CSRF digests are exactly 64 lowercase hexadecimal characters.
- Foreign key to the canonical identity table with deliberate delete/revocation behavior.
- Runtime database role receives only required SELECT/INSERT/UPDATE privileges on this table; no schema ownership, DDL, or BYPASSRLS.
- Never grant application runtime access to migration-owner credentials.

## Integration caveats

- The table does not exist as a verified provisioned object.
- No database pool is instantiated or connected by this module.
- The adapter is not wired into server startup or HTTP routes.
- User-wide session revocation and session rotation are not yet implemented.
- Session lookup and revocation behavior still requires integration testing against the actual PostgreSQL version and runtime role.
- Cleanup must be bounded and scheduled; do not perform unbounded deletes in request handlers.
- Production session lifecycle should include rotation on authentication/privilege changes, revocation on logout and account disablement, and explicit concurrency policy.

## Next gates

1. Review the canonical identity and membership schema without applying changes.
2. Design membership reads and role changes with transaction/locking semantics.
3. Prepare a separate migration proposal and rollback plan for human review.
4. Test against a disposable PostgreSQL instance in CI using synthetic data and a least-privilege runtime role.
5. Wire the adapter only after schema approval and integration tests.
6. Do not mark production authentication enabled until HTTP integration, RLS, audit, rate limits, and incident-safe revocation are proven.

## Cost and safety

This adapter has no third-party runtime dependency and does not itself incur service cost. CI may use a disposable service container only after workflow design is reviewed. No paid database, production secret, or deployment is required for the current source-only stage.
