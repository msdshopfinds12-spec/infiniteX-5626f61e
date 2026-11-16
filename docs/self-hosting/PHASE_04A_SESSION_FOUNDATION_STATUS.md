# InfiniteX Phase 04A — Session Security Foundation

**Status:** Source foundation added; not wired to HTTP routes or a production database.
**Branch:** `feat/provider-neutral-billing-sandbox`
**Scope:** reusable cryptographic token, CSRF, cookie-policy, and session-service primitives.

## Implemented in this slice

- 256-bit opaque tokens generated with Node.js `crypto.randomBytes`.
- SHA-256 token digests for persistence; raw session tokens are returned only at creation.
- Timing-safe comparison for token digests.
- Host-only `__Host-` session cookie policy with `Secure`, `HttpOnly`, `Path=/`, and `SameSite=Lax`.
- Duplicate-cookie rejection and bounded Cookie header parsing.
- CSRF synchronizer-token generation and digest verification.
- Session service with a required persistence adapter; there is no in-memory production fallback.
- UUID validation, bounded session lifetime, expiry enforcement, and server-side revocation contract.
- Node built-in tests using a test-only in-memory adapter.

## Deliberately not implemented in this slice

- OIDC discovery, authorization start, callback, token exchange, or ID-token validation.
- Production PostgreSQL session/login-transaction repositories.
- Database schema or migrations.
- HTTP route wiring, browser Origin policy, rate limiting, or authenticated-principal middleware.
- Android App Link registration or provider-specific client registration.

These omissions are intentional. The production session store must be durable and must persist only token digests. Login transactions also need single-use atomic consumption. Do not substitute process memory for either requirement.

## Dependency gate

The approved exact candidate is `openid-client@6.9.0`. It is not added to `package.json` or `package-lock.json` in this slice because the repository environment available for this operation cannot reach the npm registry to generate and verify a consistent lockfile. Do not hand-edit the lockfile or claim the dependency is installed. Add it in the next dependency-resolution step using npm, then commit both manifest and generated lockfile together.

## Verification

Proposed commands from `apps/api`:

```sh
node --test test/auth-*.test.mjs
npm run check
npm test
```

No execution result is implied by this document. CI or a real local run must establish the result.

## Release boundary

No production migrations, provider provisioning, secrets, paid services, merge, or deployment are included. The HTTP API remains unauthenticated until the OIDC callback, durable identity mapping, persistent session repository, principal middleware, and workspace authorization are integrated and tested as one vertical slice.
