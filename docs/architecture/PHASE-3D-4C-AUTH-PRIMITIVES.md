# Phase 3D-4C — Authentication and Workspace Policy Primitives

Status: **IMPLEMENTED AS ISOLATED MODULES; NOT INTEGRATED INTO HTTP ROUTES**

## Delivered source

- `src/auth/opaque-token.mjs`: 256-bit cryptographically random URL-safe token generation, canonical token validation, SHA-256 digesting, and constant-time digest comparison.
- `src/auth/csrf.mjs`: synchronizer-token generation, digest verification, and exact-origin predicate for future mutation middleware.
- `src/auth/cookie-policy.mjs`: strict `__Host-` cookie name policy, Secure/HttpOnly/Path=/, SameSite=Lax or Strict, bounded Max-Age, duplicate-cookie rejection, and expiry serialization.
- `src/auth/middleware.mjs`: fail-closed server-session principal resolution plus exact-Origin and CSRF checks for mutation requests. Helpers are not yet wired into public application routes.
- `src/auth/session-service.mjs`: dependency-injected session lifecycle. Requires a repository adapter, stores only token digests through that adapter, returns a CSRF token once at creation, resolves active sessions, checks expiry, and supports revocation.
- `src/authorization/policy.mjs`: deny-by-default owner/admin/member/viewer permission map, active principal and membership checks, workspace scope matching, own-resource enforcement, and last-owner/ownership-transfer safeguards.
- `test/auth.test.mjs`: unit coverage for token validation, CSRF, cookie policy, session lifecycle, expiry, workspace isolation, role denial, resource ownership, and last-owner protection.

## Security boundary and known gaps

These are primitives, not a complete authentication system.

- No login or identity-provider integration exists.
- No production session repository or database adapter exists.
- No public application route currently consumes these middleware helpers.
- No session rotation, concurrent-session policy, credential-change revocation, or account recovery flow is wired.
- No persistent membership repository is connected to the policy helper.
- No database transaction protects role changes or the last-owner invariant yet.
- CSRF and Origin checks are helpers only; no mutation endpoint exists to enforce them.
- No RLS policies or migrations were created or applied.

Do not expose protected API routes or mark production authentication as enabled until those integration gaps are addressed and tested.

## Test and CI evidence

- Test source was committed, including middleware tests.
- CI syntax check was expanded to include all auth and authorization modules.
- GitHub Actions were pinned to immutable commit SHAs.
- The available workflow-run lookup returned no PR-triggered runs for the latest documentation commit. It does not expose push-triggered run status through that wrapper.
- Therefore **actual CI execution and test pass status remain UNVERIFIED**.

## Next implementation gate

1. Define a persistent repository contract and implement a local test adapter only for tests.
2. Add HTTP authentication middleware that resolves a session to a server-owned principal.
3. Add protected test-only route fixtures; prove missing, expired, revoked, and malformed sessions are denied.
4. Enforce CSRF and exact Origin on any cookie-authenticated mutation.
5. Add membership repository and transactional role-change service.
6. Only after review, design the PostgreSQL adapter and separate migration proposal. No migration execution is authorized by this phase.
