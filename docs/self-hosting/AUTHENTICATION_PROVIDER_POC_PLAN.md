# InfiniteX Authentication Provider POC — Execution Plan

**Status:** PLAN ONLY — no provider selected, installed, or exposed.
**Branch:** `feat/provider-neutral-billing-sandbox`
**Date:** 2026-11-17
**Decision mode:** Compare Keycloak and authentik using one provider-neutral relying-party contract.
**Safety boundary:** Synthetic identities only. No production credentials, persistent migrations, public ingress, paid provisioning, merge, or deployment.

## 1. Objective

Determine whether Keycloak or authentik is the better first OIDC proof-of-concept provider for InfiniteX. The decision must be evidence-based and reproducible. Do not select a winner from feature claims alone.

The POC must validate the same application-side relying-party behavior against both candidates. Provider-specific behavior belongs in configuration and a thin adapter, not in business authorization logic.

## 2. Verified baseline and constraints

- API is native Node.js HTTP using ES modules; Node.js >=22.
- PostgreSQL client dependency is `pg@8.16.3`.
- The repository has an `identity_links(issuer, subject)` uniqueness boundary.
- The database-verified transaction-bound assertion layer exists, but is not end-user authentication.
- No production OIDC middleware/provider has been selected.
- Browser architecture is a server-side BFF with Authorization Code + PKCE S256.
- Android uses the system browser and public-client Authorization Code + PKCE S256. Never embed a client secret in an APK.
- Do not implement JWT/JWS/JWK cryptography, discovery, code exchange, or PKCE primitives from scratch.

## 3. POC architecture

```text
Browser / Android system browser
             |
             | HTTPS authorization redirect + callback
             v
InfiniteX API (BFF / OIDC relying party)
  |-- provider config (allowlisted issuer)
  |-- maintained OIDC client library (not yet selected)
  |-- state / nonce / PKCE transaction store
  |-- claims mapper -> AuthenticatedPrincipal
  |-- local opaque session service
  |-- identity-link repository (issuer + subject)
  |-- workspace authorization guard
  '-- signed DB assertion adapter
             |
             v
      PostgreSQL (disposable POC only)

Candidate A: Keycloak (isolated, synthetic realm)
Candidate B: authentik (isolated, synthetic tenant/provider)
```

The POC must not create an endpoint that accepts a caller-supplied user ID as proof of authentication. A verified principal is constructed only after the maintained OIDC library validates the ID token and the application maps the exact issuer and subject.

## 4. Provider-neutral contracts

Use runtime validation at every external boundary. Types alone do not validate network input.

```ts
export type AuthenticatedPrincipal = Readonly<{
  userId: string;
  issuer: string;
  subject: string;
  sessionId: string;
  authenticatedAt: string;
}>;

export type OidcProviderConfig = Readonly<{
  issuer: string;                 // exact configured HTTPS issuer
  clientId: string;
  redirectUri: string;            // exact registered URI
  postLogoutRedirectUri?: string;
  allowedSigningAlgorithms: readonly string[];
}>;

export interface OidcRelyingParty {
  createAuthorizationRequest(input: {
    state: string;
    nonce: string;
    codeChallenge: string;
    redirectUri: string;
  }): Promise<URL>;

  completeAuthorization(input: {
    code: string;
    expectedState: string;
    expectedNonce: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<{
    issuer: string;
    subject: string;
    authenticatedAt: Date;
  }>;
}

export interface SessionRepository {
  create(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  findActiveByTokenHash(tokenHash: string): Promise<{
    sessionId: string;
    userId: string;
    expiresAt: Date;
  } | null>;
  revoke(sessionId: string, reason: string): Promise<void>;
}
```

## 5. Required security invariants

### Protocol
- HTTPS issuer; issuer is static trusted configuration, never request input.
- Discovery metadata and JWKS are retrieved only from the configured issuer.
- Authorization Code flow with PKCE S256; reject plain or missing PKCE.
- Cryptographically random, single-use, short-lived state and nonce.
- Bind the login transaction to the initiating browser session.
- Exact redirect URI matching; no wildcard or open redirect.
- Validate signature, issuer, audience, authorized party where applicable, expiry, issued-at policy, nonce and token type.
- Explicit signing-algorithm allowlist; reject `none`, unexpected algorithms, malformed claims and unknown keys.
- JWKS rotation must fail closed when verification cannot be completed.
- No password grant or direct access grant.

### Session and browser
- Opaque session token from a cryptographically secure random generator.
- Store only a cryptographic hash of the session token.
- Secure + HttpOnly + SameSite cookie; narrow Path; no Domain unless justified.
- Rotate session after login and privilege elevation.
- Server-side revocation on logout; clear cookie with matching attributes.
- CSRF defense and strict Origin validation for cookie-authenticated mutations.
- Never put tokens, codes, state secrets or session identifiers in URLs, localStorage, analytics or logs.
- Rate-limit login initiation, callbacks and session endpoints.
- Redact cookies, authorization headers, tokens, codes, nonce, verifier and provider claims.

### Identity and authorization
- Map identity only by exact `(issuer, subject)`.
- Email is profile metadata, never an automatic account-link key.
- No automatic account creation or email-based account linking in the POC.
- Unknown identities are denied with a generic response.
- Disabled or pending local accounts fail closed.
- Workspace membership and permissions are re-read from server-side database state.
- Only a trusted principal may reach the existing transaction-bound database assertion signer.
- No request body, query parameter, client header or frontend role can establish identity or authorization.

## 6. Comparative test matrix

Run the identical test cases against both providers. Record exact provider version, image digest, configuration export hash, test commit, timestamp, logs with secrets redacted, and outcome.

| ID | Test | Expected result |
|---|---|---|
| P01 | Discovery from configured issuer | Metadata issuer exactly matches configured issuer |
| P02 | Authorization Code + PKCE S256 | Valid synthetic login succeeds |
| P03 | Missing or plain PKCE | Rejected |
| P04 | State mismatch | Callback rejected; transaction consumed |
| P05 | Nonce mismatch | ID token rejected |
| P06 | Wrong issuer | ID token rejected |
| P07 | Wrong audience / invalid authorized party | ID token rejected |
| P08 | Expired ID token | Rejected |
| P09 | Invalid signature / unknown key | Rejected |
| P10 | Unsupported signing algorithm / none | Rejected |
| P11 | Unregistered redirect URI | Authorization request rejected |
| P12 | Callback replay | Rejected |
| P13 | Unknown issuer/subject identity | No account auto-created; access denied |
| P14 | Same email, different subject | No implicit account linking |
| P15 | Disabled local account | Access denied |
| P16 | Revoked local session | Protected route denied |
| P17 | CSRF / invalid Origin | Cookie-authenticated mutation denied |
| P18 | Logout | Session revoked and cookie cleared |
| P19 | Provider unavailable / JWKS unavailable | Protected route fails closed |
| P20 | Android system-browser redirect | Correct app return path; no embedded WebView |
| P21 | Secret/log inspection | No secrets or bearer credentials in logs or client artifacts |
| P22 | Backup and restore | Isolated restore rehearsal succeeds |
| P23 | Resource measurement | Repeatable CPU, RAM, storage and startup measurements |
| P24 | Upgrade rehearsal | Supported upgrade path and rollback documented |

A test is PASS only when the test actually ran and evidence is retained. A configuration review alone is NOT TESTED for runtime behavior.

## 7. Scorecard — no guessed scores

| Criterion | Weight | Evidence required |
|---|---:|---|
| OIDC + PKCE interoperability | 15 | P01–P12 test evidence |
| Security maintenance | 15 | Supported versions, advisories, update process |
| License suitability | 10 | Exact release license and review |
| Resource footprint | 10 | Same-host repeatable measurements |
| Backup and restore | 10 | P22 evidence |
| Android integration | 10 | P20 evidence |
| Browser session integration | 10 | P16–P18 evidence |
| Portability/export | 5 | Export/import rehearsal |
| Admin auditability | 5 | Admin-role and audit-event review |
| Operational burden | 10 | Upgrade, rollback, monitoring and recovery runbook |

Score each criterion 1–5 only after evidence exists. Unknown is **NOT VERIFIED**, not zero and not an estimate. Keep raw measurements and scoring rationale.

## 8. Execution sequence and approval gates

1. **PLAN (current):** define common contract, security invariants and comparative tests.
2. **APPROVE:** user explicitly approves isolated POC provisioning and names the allowed environment and resource budget.
3. **BUILD:** add the selected maintained OIDC client library and thin adapter; do not build cryptography.
4. **TEST:** run unit, protocol integration and adversarial tests with synthetic identities.
5. **AUDIT:** review dependencies, license, logs, secrets, redirect handling, cookies, CSRF, SSRF boundaries, admin exposure and restore procedure.
6. **RELEASE REVIEW:** report evidence and unresolved risks. Production remains a separate approval.

## 9. Explicitly prohibited without separate approval

- Installing or provisioning an identity provider.
- Exposing an identity provider/admin console or database to the public internet.
- Paid hosting, subscriptions or resource upgrades.
- Creating or changing production secrets.
- Applying migrations to any persistent/non-disposable database.
- Changing firewall, DNS, OAuth callback configuration or production environment variables.
- Merging, tagging, releasing or deploying.
- Enabling payment or billing flows.

## 10. Acceptance criteria

The comparative POC is complete only when:
- Both candidates are tested with the same application-side contract and test cases.
- All security-critical negative cases pass.
- Provider versions, configuration and evidence are reproducible.
- Resource and restore measurements are recorded.
- License and security-maintenance reviews are documented.
- No secrets or production data were used.
- A recommendation explains trade-offs and remaining risks.
- No production action has occurred.

## 11. Current status

| Work item | Status |
|---|---|
| Provider-neutral design | DOCUMENTED |
| Comparative test matrix | DOCUMENTED |
| Provider selected | BLOCKED — user decision required |
| Runtime OIDC implementation | NOT STARTED |
| Provider installation | NOT AUTHORIZED |
| POC protocol tests | NOT RUN |
| Production authentication | NOT READY |
| Production migration / merge / deployment | NOT AUTHORIZED |
