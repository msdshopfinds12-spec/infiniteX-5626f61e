# InfiniteX Authentication Threat Model — Phase 04B

**Status:** Review artifact; not a security certification.
**Scope:** Browser OIDC login, opaque API sessions, PostgreSQL persistence and workspace authorization.

## Assets
- User identity mapping (issuer, subject)
- Session token and CSRF token
- OIDC state, nonce, authorization code and PKCE verifier
- Provider metadata and signing keys
- Account status and workspace memberships
- Database signing keys, authentication persistence and audit events

## Trust boundaries
1. User agent ↔ API over HTTPS
2. API ↔ OIDC provider over validated TLS
3. API ↔ PostgreSQL using restricted roles
4. Authentication principal ↔ workspace authorization/RLS
5. CI ↔ disposable test database

## Threats and required controls
| Threat | Required control | Verification evidence |
|---|---|---|
| Login CSRF / callback injection | CSPRNG state, digest persistence, atomic single-use consume | Parallel replay and wrong-state tests |
| Token substitution / session fixation | Fresh 256-bit local session after OIDC validation | Session rotation test |
| ID-token forgery | Maintained library; signature/JWKS, issuer, audience, nonce, time checks | Invalid signature/issuer/audience/nonce tests |
| Authorization-code interception | PKCE S256, exact redirect URI, short-lived transaction | Wrong verifier and redirect mismatch tests |
| Email collision account takeover | Exact issuer+subject mapping; no auto-link by email | Same email/different subject test |
| Session theft | Secure HttpOnly host-only cookie; TLS; no token logging | Cookie and log-redaction tests |
| CSRF on unsafe endpoints | Synchronizer token + strict Origin allowlist | Missing/wrong CSRF and Origin tests |
| Callback replay | Atomic transaction consume | Concurrent callback test; one winner only |
| Stale access after logout | Durable revocation checked per request | Revoke then resolve test |
| Cross-workspace access | Existing DB-verified identity boundary + RLS | Adversarial PostgreSQL suite |
| Auth-table privilege escalation | Private schema; narrow definer functions; no general BYPASSRLS | Role privilege and function ACL tests |
| Denial of service | Rate limits, bounded inputs, timeouts, bounded login TTL | Load and malformed-input tests |
| Secret disclosure | Redaction; no credentials in repo, URL, errors or telemetry | Canary-secret scan and log assertions |

## Residual risks
- Provider configuration and key rotation remain operational dependencies.
- A compromised API process can access decrypted short-lived PKCE material and issue sessions.
- Database superuser compromise is outside application-level RLS guarantees.
- Cookie behavior, reverse-proxy TLS termination and Android App Links require environment-specific validation.
- Free-tier limits and availability are not guaranteed.

## Release decision
Authentication remains disabled until Phase 04B acceptance criteria pass, CI is green on the exact release candidate, and a human explicitly approves release.