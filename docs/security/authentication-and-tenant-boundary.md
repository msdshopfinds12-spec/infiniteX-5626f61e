# Authentication and Tenant Boundary

**Implementation status: CODED ON THE HARDENING BRANCH; RUNTIME VERIFICATION PENDING.**

## Product security model

This repository's documented target is a private, single-owner system. The API therefore binds every authenticated request to one server-configured owner subject and one server-configured tenant UUID. This is not a general multi-tenant identity system.

## Request path

1. The client sends an access token in `Authorization: Bearer <JWT>`.
2. The API obtains signing keys only from the operator-configured JWKS URL.
3. The API verifies the JWT signature using the fixed `RS256` algorithm, exact issuer, exact audience, expiry and required claims.
4. The API compares the verified `sub` claim with the configured owner subject.
5. The API constructs a principal using the configured tenant UUID. The request cannot select or override this value.
6. Task and Company Brain repositories receive the server-created tenant identity and retain tenant predicates in database queries.

## Required configuration

- `INFINITEGX_JWT_JWKS_URL`: HTTPS JWKS endpoint belonging to the chosen identity provider.
- `INFINITEGX_JWT_ISSUER`: exact issuer value expected in tokens.
- `INFINITEGX_JWT_AUDIENCE`: API audience.
- `INFINITEGX_OWNER_SUBJECT`: immutable subject identifier for the single owner.
- `INFINITEGX_OWNER_TENANT_ID`: server-owned UUID for this installation.

All five values are required. Missing or invalid configuration fails closed. Production requires HTTPS for JWKS. Do not put a client secret or private signing key in this application repository. Configure MFA/passkeys and session revocation at the identity provider.

## Tenant spoofing

`X-Tenant-ID` is not an authorization input and is ignored. The API does not accept tenant IDs from task or memory request bodies. A signed token from any other subject is rejected even if the caller supplies the owner's tenant UUID.

## Idempotency

Task creation accepts an optional `Idempotency-Key` with 1-128 safe ASCII characters. A deterministic UUIDv5 is derived from the configured tenant and key, reusing the existing task primary key without a schema migration. Replaying the same key and same normalized request returns the existing task; replaying the key with a different request returns HTTP 409. The database primary key arbitrates concurrent creation. A dedicated idempotency table and retention policy may be introduced only with a separately approved migration.

## Database controls still required

- Existing repositories include tenant predicates and set PostgreSQL's transaction-local `app.tenant_id` setting before tenant-scoped operations.
- **RLS is not confirmed enabled by this code change.** No migration was created or run because migrations are outside the approved scope.
- Before production, prepare a separate reviewed migration to enable and FORCE ROW LEVEL SECURITY on tenant-owned tables, add restrictive policies, and ensure the runtime database role is neither superuser nor `BYPASSRLS`.
- Run real PostgreSQL integration tests using separate owner and unprivileged roles. SQLite tests do not verify PostgreSQL RLS behavior.
- Review transaction boundaries, backup/restore, key rotation, rate limiting, audit logging, and identity-provider session revocation before release.

## Operational behavior

If the identity provider or JWKS endpoint is unavailable, the API returns a service-unavailable response and does not fall back to a shared token, unsigned identity, client tenant header, or anonymous mode. Do not add a paid model/provider fallback to this authentication path.
