# InfiniteX Authentication Phase 02 — Build Manifest

**Status:** PLAN / BUILD MANIFEST — provider-neutral; runtime implementation is not authorized by this artifact.
**Branch:** `feat/provider-neutral-billing-sandbox`
**Date:** 2026-11-17
**Scope:** define the smallest secure authentication slice that can be implemented after provider and framework approval.
**Out of scope:** provider installation, public ingress, production secrets, persistent migrations, live email/SMS, payment activation, merge and deployment.

## 1. Verified repository baseline

- API runtime is native Node.js HTTP using ES modules; it currently exposes health/readiness routes only.
- API package requires Node.js >=22 and currently pins `pg@8.16.3`.
- There is no Fastify dependency or authentication framework in the current API package.
- The repository already has `identity_links(issuer, subject)` with a unique constraint and local `app_users` records.
- The database-verified transaction-bound HMAC assertion layer exists and has a passing PostgreSQL 17 disposable CI run (run #55, 54 tests passed, 0 failed).
- The assertion signer is not an end-user authentication mechanism.
- OIDC provider evaluation lists Keycloak, authentik, ZITADEL and Ory; no provider is selected.
- Existing OIDC blueprint recommends a browser BFF and system-browser Authorization Code + PKCE S256 for Android.

## 2. Architecture decision for the next slice

Keep the API provider-neutral and use a maintained OIDC relying-party library. Do not implement JWT/JWS/JWK cryptography, OAuth token exchange, discovery parsing or PKCE primitives from scratch.

### Browser
1. Browser requests login start from the API.
2. API creates high-entropy state, nonce and PKCE verifier/challenge.
3. API stores the one-time transaction server-side with a short expiry and binds it to a pre-authentication browser session.
4. Browser is redirected to the configured issuer authorization endpoint.
5. API callback validates state and transaction, exchanges the authorization code using the original verifier, and validates the ID token.
6. API resolves exact `(issuer, subject)` to a local `app_users.id`; email is not an identity key.
7. API creates an opaque random local session. Only a hash of the session token is persisted.
8. Browser receives a Secure, HttpOnly, SameSite cookie. Provider refresh/access tokens are not exposed to browser JavaScript.

### Android
- Use the system browser, never an embedded WebView.
- Use Authorization Code + PKCE S256 as a public client.
- Do not embed a client secret in an APK or remote configuration.
- Use verified HTTPS App Links where available; review custom URI scheme collision and account-switch behavior.
- Treat Android token storage and native logout as a separately tested client integration. Do not silently reuse browser cookie assumptions.

### API to PostgreSQL
- Middleware resolves a trusted local principal from a validated local session or verified native access token.
- Workspace membership and permission are resolved from server-side database state.
- Only after authentication and workspace authorization does the API create the existing short-lived database assertion.
- The database verifier continues to enforce transaction binding and RLS.
- No request body, query string, untrusted header or frontend role value can establish identity or permission.

## 3. Provider-neutral application contracts

These are design contracts, not compiled source code. Runtime schemas must validate every external value.

```ts
type AuthenticatedPrincipal = Readonly<{
  userId: string;
  issuer: string;
  subject: string;
  sessionId: string;
  authenticatedAt: string;
}>;

type OidcProviderConfig = Readonly<{
  issuer: string;             // exact HTTPS issuer URL
  clientId: string;
  redirectUri: string;        // exact registered URI
  postLogoutRedirectUri?: string;
  allowedSigningAlgorithms: readonly string[];
}>;

interface OidcRelyingParty {
  createAuthorizationRequest(input: {
    state: string;
    nonce: string;
    codeChallenge: string;
    redirectUri: string;
  }): Promise<URL>;

  completeAuthorization(input: {
    code: string;
    state: string;
    expectedNonce: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<{
    issuer: string;
    subject: string;
    authenticatedAt: Date;
  }>;
}

interface SessionRepository {
  create(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    rotatedFromSessionId?: string;
  }): Promise<void>;
  findActiveByTokenHash(tokenHash: string): Promise<{
    sessionId: string;
    userId: string;
    expiresAt: Date;
  } | null>;
  revoke(sessionId: string, reason: string): Promise<void>;
}
```

Important: a TypeScript interface does not validate a runtime object. Provider claims must be validated by the maintained OIDC library and mapped to a minimal internal principal.

## 4. Required security controls

### OIDC protocol
- HTTPS issuer and exact issuer comparison.
- Discovery metadata fetched only from configured issuer; no user-controlled issuer or arbitrary URL input.
- Authorization Code flow with PKCE S256.
- Exact redirect URI allowlist; no wildcard redirect matching.
- Cryptographically random state and nonce, single-use and short-lived.
- Validate signature against trusted issuer JWKS with an explicit algorithm allowlist.
- Validate issuer, audience, authorized party when applicable, expiry, issued-at policy and nonce.
- Reject ID-token algorithm `none`, unexpected token types, unknown keys and malformed claims.
- Handle JWKS rotation through the maintained library; never disable signature verification during outages.
- No password/direct-access grant for browser or Android public clients.

### Session and browser
- Opaque session token generated from a CSPRNG; persist only a keyed/cryptographic hash.
- Secure, HttpOnly, SameSite cookie with narrow Path and no Domain unless required.
- Rotate session at login and privilege elevation.
- Logout revokes the server-side session and clears cookie.
- CSRF token or robust double-submit/synchronizer defense for cookie-authenticated mutations, plus strict Origin validation.
- No access/refresh token or session token in localStorage, URLs, logs or analytics.
- Rate-limit login start, callback failures and session endpoints.
- Generic user-facing errors; never reveal whether an account exists.

### Identity linking
- Resolve by exact normalized issuer + exact subject only.
- Never auto-link an existing account by email address alone.
- Account linking requires a separate authenticated proof of control of both identities and audit record.
- Disabled/pending-review local accounts fail closed.
- Unknown identity behavior must be explicit: deny and require a reviewed invitation/provisioning path; no silent account creation until approved.

### Database and operational boundaries
- Runtime DB role remains least-privileged.
- Session/token tables, if added, require a separate reviewed migration.
- Provider secrets remain server-side and outside Git.
- Logs redact cookies, tokens, codes, verifier, nonce, secrets and raw provider claims.
- Provider outage fails closed for protected routes; health endpoint may remain available.
- No provider admin console or PostgreSQL port is public during evaluation.

## 5. Proposed module layout

Do not create every module up front. Add only what the first tested vertical slice needs.

```text
apps/api/src/
  auth/
    auth.routes.mjs
    auth.service.mjs
    oidc/
      oidc-client.mjs
      provider-config.mjs
      claims-mapper.mjs
    sessions/
      session-service.mjs
      session-repository.mjs
      cookie-policy.mjs
      csrf.mjs
    identity/
      identity-link-repository.mjs
      principal.mjs
  security/
    rate-limit.mjs
    redact-secrets.mjs
  authorization/
    workspace-guard.mjs
  infrastructure/
    database/
      pool.mjs
      transaction.mjs
```

Avoid premature microservices, Redis, Kubernetes, a custom password store and a large framework migration. Reassess only with measured requirements.

## 6. Implementation order after explicit approval

1. Select exact provider and version; record license, security-update, backup/restore and host resource evidence.
2. Select browser session architecture and Android redirect strategy.
3. Approve API framework/library choice and dependency license review.
4. Add config schema that rejects insecure production defaults and arbitrary issuer URLs.
5. Implement OIDC start/callback using the maintained library.
6. Implement exact issuer/subject identity mapping with concurrency-safe insert/select.
7. Implement opaque local session create/read/revoke, cookie policy and CSRF defense.
8. Add authentication middleware that emits an immutable internal principal.
9. Connect middleware to workspace authorization and the existing transaction-bound DB assertion.
10. Add route tests, protocol adversarial tests, database integration tests and log-redaction tests.
11. Run CI, inspect logs, fix failures, and complete independent security review.
12. Keep production migration, provider installation, public ingress, merge and deployment as separate approval gates.

## 7. Required test matrix

| Area | Adversarial case | Expected result |
|---|---|---|
| State | missing, wrong, expired, replayed | deny callback |
| PKCE | wrong verifier or challenge method other than S256 | deny callback |
| Nonce | missing or mismatched | deny callback |
| Issuer | wrong issuer or issuer mix-up | deny callback |
| Signature | invalid signature, `none`, disallowed algorithm | deny callback |
| JWKS | unknown key, malformed key, temporary provider outage | fail closed; safe retry policy |
| Claims | wrong audience, expired token, future issued-at beyond skew | deny callback |
| Redirect | unregistered URI or open redirect attempt | deny |
| Identity | duplicate issuer+subject race | one stable local identity |
| Linking | same email, different subject | never auto-link |
| Account | disabled or pending-review local user | deny session |
| Session | random token, expired, revoked, rotated old token | reject invalid session |
| Cookie | missing Secure/HttpOnly/SameSite in production profile | test failure |
| CSRF | missing token, wrong Origin, cross-site mutation | deny mutation |
| Authorization | no membership, viewer mutation, cross-workspace ID substitution | deny |
| Database | transaction mismatch or invalid signed assertion | RLS denies |
| Logging | injected token/code/cookie in error path | secret absent from logs |
| Operations | provider outage, shutdown, DB pool failure | fail closed; graceful cleanup |

## 8. Acceptance gates

- [ ] Provider and exact version approved.
- [ ] License and security-maintenance review complete.
- [ ] Browser BFF flow and Android system-browser flow documented.
- [ ] Framework and maintained OIDC library approved.
- [ ] No arbitrary issuer/redirect configuration.
- [ ] Identity mapping and no-email-auto-link tests pass.
- [ ] Session, CSRF and cookie tests pass.
- [ ] Database assertion integration passes with verified principal only.
- [ ] Full CI logs inspected; test count and commit SHA recorded.
- [ ] Independent security review has no unresolved critical/high findings.
- [ ] Production migration, provider provisioning, merge and deployment remain separately authorized.

## 9. Current gate decision

**BUILD BLOCKED BY DESIGN INPUTS, not by a coding limitation.**

The existing repository already contains the provider shortlist, OIDC blueprint, API authorization contract and database identity layer. The missing decisions are the exact provider/version, tested deployment host, browser/native session strategy, API framework/library approval and identity onboarding policy.

Do not install a provider or add an OIDC dependency until those decisions are approved. A provider-neutral interface and test suite can be built after the contracts are accepted, but it must not be represented as production authentication.
