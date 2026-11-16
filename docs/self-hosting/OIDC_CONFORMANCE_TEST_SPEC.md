# InfiniteX — OIDC Conformance and Adversarial Test Specification

**Status:** TEST DESIGN ONLY — no runtime implementation or provider deployment authorized.
**Branch:** `feat/provider-neutral-billing-sandbox`
**Applies to:** Keycloak, authentik, ZITADEL, and Ory candidates.
**Authority:** `AUTHENTICATION_PHASE_02_BUILD_MANIFEST.md` and `OIDC_PROVIDER_EVALUATION_PLAN.md`

## 1. Purpose and non-goals

Define a reproducible, provider-neutral test contract before implementing the OIDC relying party. This document is not evidence that tests have run or that any provider is compliant.

Non-goals: production sign-in, real-user migration, password storage, production secrets, live email/SMS, payment activation, public identity-provider hosting, or selecting a provider by marketing claims.

## 2. Trust boundaries

1. Browser/native client is untrusted.
2. Only the configured issuer and registered client configuration are trusted inputs.
3. Authorization responses, claims, headers, query parameters, and user profile fields are untrusted until protocol validation completes.
4. The OIDC library owns discovery, cryptographic token validation, code exchange, PKCE, and JWKS handling.
5. Application code maps validated `(issuer, subject)` to a local principal.
6. Workspace permissions are loaded server-side; frontend roles never grant access.
7. PostgreSQL assertions are issued only after local authentication and authorization.

## 3. Test harness contract

The eventual test harness must use:
- Node.js version meeting the repository's declared engine.
- The repository's existing native Node.js HTTP API unless a framework change is separately approved.
- A maintained OIDC relying-party library selected only after license, maintenance, and API review.
- Node's built-in test runner where practical; no paid SaaS test dependency.
- Synthetic issuer, client, user, and workspace fixtures.
- An isolated disposable database for integration tests; never production data.
- Deterministic fixtures for ordinary tests and cryptographically generated values for security-sensitive flows.

Provider-specific adapters may normalize provider setup, but must not weaken shared assertions or skip negative tests.

## 4. Required test groups

### A. Configuration and discovery
- Reject missing issuer, client ID, redirect URI, and insecure production cookie configuration.
- Reject non-HTTPS issuer in production mode.
- Reject issuer values supplied by request parameters, headers, or user profiles.
- Require exact discovery issuer equality with configured issuer.
- Reject redirect URI wildcard, host mismatch, path mismatch, and scheme downgrade.
- Reject unsupported signing algorithms and implicit `none`.

### B. Authorization transaction
- Accept a valid one-time state and matching pre-authentication session.
- Reject missing, malformed, incorrect, expired, and replayed state.
- Reject a callback whose browser transaction binding differs.
- Reject missing or mismatched nonce.
- Reject missing/incorrect PKCE verifier and non-S256 challenge methods.
- Reject authorization code reuse and callback replay.
- Reject open-redirect destinations and unregistered callback URLs.

### C. Token validation
- Accept a correctly signed ID token from the configured issuer and intended client.
- Reject invalid signature, unknown key, wrong issuer, wrong audience, invalid authorized party when applicable, expired token, future issued-at outside policy, and malformed subject.
- Reject unexpected token type and algorithm downgrade.
- Exercise JWKS rotation with overlapping old/new keys.
- On JWKS/network outage, fail closed; never skip signature checks.
- Ensure access tokens are not treated as ID tokens and vice versa.

### D. Identity mapping
- Resolve only exact issuer + subject.
- Same email with a different subject must not auto-link.
- Same subject under a different issuer must not auto-link.
- Email changes must not change the local user identity.
- Concurrent first-login requests for the same issuer+subject must resolve to one stable link.
- Unknown identity follows an explicit deny/invitation policy; no silent signup unless separately approved.
- Disabled or pending-review local users are denied.

### E. Session lifecycle
- Session token is CSPRNG-generated and high entropy.
- Only token hash is persisted; raw token never appears in DB rows or logs.
- Login and privilege elevation rotate the session.
- Expired, revoked, malformed, and unknown sessions are rejected.
- Logout revokes server-side session and clears cookie.
- Cookie flags and scope match the approved browser policy.
- Cookie-authenticated state-changing requests require CSRF protection and strict Origin checks.
- Provider outage never bypasses local session or authorization checks.

### F. Authorization and database boundary
- Anonymous requests cannot reach protected workspace data.
- Authenticated user without workspace membership is denied.
- Role and workspace IDs supplied by client are ignored as authority.
- Database assertion cannot be minted before principal and permission resolution.
- Transaction-bound assertion cannot be replayed across transactions.
- RLS denies cross-tenant reads and writes.
- Runtime DB role cannot bypass RLS or perform schema administration.

### G. Android redirect contract
- Authorization uses system browser, not embedded WebView.
- Public client uses PKCE and contains no client secret.
- Redirect URI is exact and verified where Android App Links are used.
- Test wrong app-link host, path, certificate association, and callback replay.
- Account switching does not silently bind the wrong local account.
- Native token storage and logout require a separate device-level test plan.

### H. Logging and privacy
- Assert no raw authorization code, state, nonce, verifier, cookie, session token, ID token, access token, refresh token, client secret, or private key in logs.
- Provider errors are mapped to generic client responses with correlation IDs.
- Logs do not include raw provider claims or email unless a separately reviewed operational need exists.
- Error paths do not leak account existence or token-validation detail.

## 5. Minimum negative-test matrix

| Threat / invalid condition | Expected result |
|---|---|
| Wrong issuer | Reject; no session |
| Wrong audience | Reject; no session |
| Invalid signature | Reject; no session |
| Expired ID token | Reject; no session |
| Missing/mismatched nonce | Reject; no session |
| Missing/replayed state | Reject; no session |
| PKCE mismatch | Reject; no session |
| Redirect URI mismatch | Reject; no code exchange |
| JWKS key unknown | Refresh according to library policy, then fail closed |
| Same email, different subject | No automatic account link |
| Revoked local session | Reject protected request |
| Cross-workspace request | Deny; no data disclosure |
| Provider unavailable | Protected authentication fails closed |
| Malicious log payload | Secrets remain redacted |

## 6. Test evidence format

Every test run must record:
- Git commit SHA and branch.
- Node.js version and dependency lockfile hash.
- Provider product and exact version, if applicable.
- Test command and environment classification (local/disposable/CI).
- Passed, failed, skipped, and not-run counts.
- Full failure names and sanitized stack traces.
- Database engine/version for integration runs.
- Resource measurements when evaluating provider footprint.
- Artifact URL or CI run identifier.
- Reviewer and timestamp.

Never record secrets, raw tokens, private keys, production user data, or unredacted environment dumps.

## 7. Exit criteria

A provider is not considered conformant unless:
- All mandatory positive tests pass.
- All mandatory negative tests pass.
- No test is skipped to conceal unsupported security behavior.
- JWKS rotation and outage behavior are evidenced.
- Identity-link concurrency is tested against the database.
- Session revocation, CSRF, and cross-workspace authorization are tested.
- Log-redaction tests pass.
- A second reviewer can reproduce the result from the recorded commit and instructions.

Any failed mandatory security test blocks provider selection. Incomplete evidence is **UNVERIFIED**, not PASS.

## 8. Implementation sequence after approval

1. Review the exact provider shortlist, releases, licenses, and maintenance posture.
2. Approve the OIDC library and lockfile strategy.
3. Implement config validation and discovery tests.
4. Implement authorization transaction and callback using the maintained library.
5. Implement identity mapping and concurrency-safe repository tests.
6. Implement opaque session lifecycle, cookie, CSRF, and rate-limit tests.
7. Integrate the principal with workspace authorization and database assertion boundary.
8. Run the complete negative suite in disposable CI.
9. Conduct independent security review.
10. Request explicit release approval; do not merge or deploy automatically.

## 9. Current disposition

**NO PROVIDER SELECTED. NO RUNTIME TESTS EXECUTED. NO PRODUCTION CHANGE AUTHORIZED.**
