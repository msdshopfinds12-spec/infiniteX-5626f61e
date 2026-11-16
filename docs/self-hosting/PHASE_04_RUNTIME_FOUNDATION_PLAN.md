# InfiniteX — Phase 04 Runtime Foundation Plan

**Status:** REPOSITORY AUDIT + IMPLEMENTATION PLAN ONLY — no runtime source changes authorized by this document.
**Repository:** `msdshopfinds12-spec/infiniteX-5626f61e`
**Branch:** `feat/provider-neutral-billing-sandbox`
**Scope:** reconcile the existing authentication scaffolding, select one canonical runtime boundary, and define a safe first OIDC vertical slice.
**Governing documents:** `AUTHENTICATION_PHASE_02_BUILD_MANIFEST.md`, `OIDC_PROVIDER_EVALUATION_PLAN.md`, and `OIDC_CONFORMANCE_TEST_SPEC.md`.

## 1. Executive decision

Do not start implementing OIDC routes yet. The current branch contains two separate backend/authentication areas:

1. Root-level `server/auth/config.mjs`, `scripts/auth/validate-oidc-discovery.mjs`, and `tests/auth/**`.
2. Self-hosted API under `apps/api/**`, with its own package, lockfile, native Node.js HTTP server, PostgreSQL driver, and independent test suite.

The root-level modules currently validate static configuration and discovery metadata. They do not implement an OIDC authorization flow, fetch discovery metadata, exchange authorization codes, verify ID tokens, create sessions, or establish an authenticated principal.

The self-hosted API currently exposes only `GET /healthz` and `GET /readyz`; other paths return 404 and non-GET/HEAD methods return 405. It has no OIDC routes, session middleware, or user-authentication boundary.

**Recommended direction for review:** treat `apps/api` as the canonical server-side authentication and authorization runtime because it is the isolated self-hosted API with the existing PostgreSQL boundary. Keep root-level auth modules as pre-runtime configuration/discovery validators until a reviewed integration decision says whether to reuse, relocate, or retire them. Do not create a third authentication stack.

This is a recommendation, not an approved architecture change.

## 2. Repository facts observed on this branch

| Area | Observed repository state | Consequence |
|---|---|---|
| Root package | Vite/React app; Node >=22; root auth and server test scripts | Root tests are not automatically the self-hosted API test suite |
| Root auth config | `server/auth/config.mjs` exports `loadAuthConfig` | Static URL/client/origin validation only |
| Discovery validator | `scripts/auth/validate-oidc-discovery.mjs` exports `validateOidcDiscovery` | Validates supplied metadata; intentionally does not fetch URLs or verify JWTs |
| Root auth tests | `tests/auth/config.test.mjs`, `validate-oidc-discovery.test.mjs` | Test configuration and metadata validation, not interactive sign-in |
| API package | `apps/api/package.json`; Node >=22; `pg@8.16.3` | Separate dependency graph and lockfile |
| API server | `apps/api/src/server.mjs`, `app.mjs`, `config.mjs` | Native Node.js HTTP runtime, loopback default |
| API routes | `/healthz`, `/readyz`; generic 404 otherwise | No runtime authentication routes exist |
| API identity | `apps/api/src/identity/assertion-signer.mjs` | Database assertion signer is not an end-user authentication provider |
| API authorization | `apps/api/src/authorization/policy.mjs` | Existing workspace policy contract can be connected only after trusted principal resolution |
| API workspace data | `apps/api/src/workspaces/membership-repository.mjs` | Existing DB membership layer is a candidate integration point |
| API tests | `apps/api/test/**` | Separate test command: run from `apps/api` |
| CI | Root auth workflow and self-hosted API workflow are separate | Both suites must be checked and reported independently |

Repository files and line-level implementation details must be re-inspected immediately before any runtime edit; branch contents can change.

## 3. Important distinction: validation is not authentication

The existing discovery validator is correctly documented as a metadata validator only. It does not:
- fetch an issuer's discovery document;
- constrain network redirects or response size at fetch time;
- perform authorization-code exchange;
- validate ID-token signatures or claims;
- create or rotate browser sessions;
- authenticate Android users;
- establish a trusted application principal.

Do not promote a successful discovery-validator test to an authentication PASS. It is only one prerequisite check.

Likewise, the database HMAC assertion is an internal transaction-bound database trust mechanism. It must only be minted after the API has authenticated a principal and authorized workspace access.

## 4. Canonical target architecture (proposal)

```text
Browser / Android system browser
          |
          | Authorization Code + PKCE S256
          v
apps/api — canonical BFF / API boundary
  |-- auth/config validation
  |-- OIDC relying-party library (maintained)
  |-- one-time login transaction store
  |-- callback + issuer/nonce/audience/signature validation
  |-- exact (issuer, subject) identity resolution
  |-- opaque local session lifecycle
  |-- cookie + CSRF policy (browser)
  |-- principal middleware
  |-- workspace authorization policy
  |-- transaction-bound DB assertion
          |
          v
PostgreSQL
  |-- app_users
  |-- identity_links (issuer, subject)
  |-- reviewed session / login-transaction persistence
  |-- workspace memberships
  |-- RLS and existing assertion verifier
```

Trust order is mandatory:

`OIDC validation → local identity resolution → local session/principal → workspace authorization → DB assertion → RLS-protected query`.

No frontend-supplied role, email, workspace ID, or arbitrary request header can substitute for a validated principal and server-side membership check.

## 5. Proposed minimal module boundaries

Only create a module when its first vertical slice and tests require it.

```text
apps/api/src/
  auth/
    auth-routes.mjs
    auth-service.mjs
    config.mjs
    oidc/
      relying-party.mjs
      provider-config.mjs
      claims-mapper.mjs
      login-transaction-store.mjs
    identity/
      identity-link-repository.mjs
      principal.mjs
    sessions/
      session-service.mjs
      session-repository.mjs
      cookie-policy.mjs
      csrf.mjs
  security/
    rate-limit.mjs
    redact-secrets.mjs
  authorization/
    policy.mjs
    workspace-guard.mjs
  identity/
    assertion-signer.mjs
  workspaces/
    membership-repository.mjs

apps/api/test/
  auth-config.test.mjs
  oidc-start.test.mjs
  oidc-callback.test.mjs
  identity-link.test.mjs
  session-lifecycle.test.mjs
  csrf.test.mjs
  auth-authorization.integration.test.mjs
  auth-log-redaction.test.mjs
```

Do not add Fastify, Express, Redis, Kubernetes, a second database, or a microservice split merely for sophistication. The current native Node.js HTTP API is adequate for a small first vertical slice unless measured requirements or a reviewed threat model justify a framework.

## 6. Decisions required before source implementation

The following must be explicitly resolved and recorded:

1. **Canonical runtime:** approve `apps/api` as the only OIDC server-side runtime, or provide a reasoned alternative.
2. **Existing root auth code:** reuse by importing, move into `apps/api`, or keep as a separate static validator. Do not duplicate business logic.
3. **Provider:** choose exact product and supported version only after the four-provider evidence review.
4. **OIDC relying-party library:** choose a maintained library after checking current maintenance, security advisories, license, Node compatibility, API fit, and transitive dependency footprint.
5. **Browser session:** approve BFF + opaque HttpOnly cookie policy, cookie scope, CSRF mechanism, and trusted origins.
6. **Android:** approve system-browser Authorization Code + PKCE S256 and exact HTTPS App Link/callback strategy. No client secret in the app.
7. **Onboarding:** deny unknown identities by default until invitation/provisioning policy is approved; no silent signup and no email-only auto-link.
8. **Persistence:** decide whether login transactions and sessions require new tables. Any schema change needs a separately reviewed migration plan.
9. **Deployment target:** identify an already-available isolated host. Do not assume a local Docker host or paid cloud resource exists.
10. **Test ownership:** define how root CI and API CI report independently and what evidence blocks merge.

## 7. Security implementation requirements

### OIDC protocol
- Exact static HTTPS issuer; no issuer discovery from request input.
- Authorization Code flow with PKCE S256.
- High-entropy, short-lived, single-use state and nonce bound to the initiating browser session.
- Exact registered redirect URI; no wildcards or open redirects.
- Maintained OIDC library performs code exchange, signature/JWKS validation, and protocol-level claim checks.
- Explicit asymmetric signing-algorithm allowlist; reject `none`.
- Validate issuer, audience, authorized party when applicable, expiry, issued-at policy, nonce, and subject.
- JWKS rotation and outage behavior must fail closed.
- Do not implement JWT/JWS/JWK cryptography, token exchange, or PKCE primitives from scratch.

### Identity and sessions
- Identity key is exact `(issuer, subject)`; email is profile data only.
- Concurrent first-login requests must not create duplicate links.
- No automatic account linking based on same email.
- Session token is CSPRNG-generated and opaque; persist only a cryptographic hash.
- Rotate on login and privilege elevation; revoke server-side on logout.
- Browser cookie: Secure, HttpOnly, SameSite, narrow Path; Domain omitted unless justified.
- Cookie-authenticated state changes require CSRF defense and strict Origin validation.
- Never put tokens, codes, verifier, nonce, or session secrets in URLs, localStorage, logs, analytics, or error messages.

### API and database
- Resolve workspace membership and role from database state, never frontend claims.
- Issue database assertion only after authenticated principal + authorized membership.
- Runtime DB role remains least privilege and cannot bypass RLS or administer schema.
- Rate-limit login start, callback failures, and session endpoints.
- Generic user-facing errors; correlation IDs are safe to log.
- Provider or DB outage must not grant access; protected routes fail closed.

## 8. Test and evidence plan

### Local/API test commands

Run only in an isolated checkout or CI environment after implementation approval:

```sh
# Root-level configuration/discovery tests
npm ci
npm run test:backend

# Self-hosted API suite (separate package and lockfile)
cd apps/api
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm test
```

These commands are a proposed verification procedure, not evidence that tests have been run in this review.

### Required test gates

- Config rejects malformed, untrusted, insecure production URLs and missing values.
- Discovery rejects issuer mismatch, untrusted endpoint origins, non-HTTPS production endpoints, missing PKCE S256, and unsafe algorithms.
- Login transaction rejects missing, incorrect, expired, and replayed state/nonce.
- Callback rejects wrong issuer, audience, signature, expiry, nonce, PKCE, redirect URI, and code replay.
- Identity repository proves exact issuer+subject behavior under concurrent inserts.
- Session tests prove hash-only persistence, rotation, expiry, revocation, cookie flags, and logout.
- CSRF tests prove missing token and wrong Origin are denied.
- Authorization tests prove no membership, disabled principal, role escalation, and cross-workspace access are denied.
- DB integration proves assertion is issued only after principal and permission checks and RLS denies cross-tenant access.
- Log-redaction tests prove no code, verifier, cookie, session token, ID/access/refresh token, secret, or private key appears.
- CI records commit SHA, Node version, lockfile hash, command, test counts, failures, skips, DB version, and run URL.

### Separate CI suites

- Root auth CI must run root auth/configuration tests.
- Self-hosted API CI must run API syntax, unit, HTTP, and disposable PostgreSQL integration tests.
- A green root auth workflow is not a green API workflow; report them separately.
- No test count or pass claim without an actual workflow result and inspected logs.

## 9. Zero-cost and Android-first constraints

- Prefer Node.js built-ins and existing PostgreSQL integration.
- No paid identity SaaS, trial requiring billing details, SMS/email service, domain purchase, or new cloud host by default.
- Open-source software is not the same as zero-cost hosting; compute, storage, bandwidth, domain, and maintenance can still cost money.
- If no existing isolated compute is available, stay at static review and CI test design. Do not provision infrastructure to keep momentum.
- Keep the workflow mobile-friendly: small reviewable commits, readable Markdown, exact copy/paste commands, and no assumption of desktop-only tooling.

## 10. Build order after approvals

1. Resolve canonical runtime and root-auth integration decision.
2. Finish exact provider/version and OIDC-library evidence review.
3. Approve browser and Android redirect/session policies.
4. Implement configuration schema and safe dependency initialization.
5. Implement login start and one-time transaction storage.
6. Implement callback through maintained OIDC library.
7. Implement issuer+subject identity resolution.
8. Implement opaque local session and logout.
9. Add principal middleware and workspace guard.
10. Integrate the existing DB assertion only after authorization.
11. Run both root and API CI suites; inspect full logs and adversarial results.
12. Perform independent security review and document unresolved findings.
13. Request separate approval for migrations, provider provisioning, merge, and deployment.

## 11. Current status and stop conditions

| Work item | Status |
|---|---|
| Root auth config/discovery validators | Present; runtime integration not verified |
| Self-hosted API bootstrap | Present; health/readiness only |
| Database assertion boundary | Present; not end-user authentication |
| OIDC provider | Not selected |
| OIDC relying-party dependency | Not approved / not present in API package |
| OIDC login/callback routes | Not present in API app |
| Local session store | Not present in API runtime |
| Principal middleware | Not present in API runtime |
| Root auth test suite | Test files present; execution not verified in this review |
| API test suite | Test files and CI workflow present; execution not verified in this review |
| Runtime source changes in this phase | None |
| Production migrations / provider provisioning / deployment | Not authorized |

**STOP:** Do not implement runtime sign-in until decisions 1–8 in Section 6 are approved. Do not create a second authentication stack. Do not describe config/discovery validation as end-user authentication. Do not claim tests pass without CI evidence.
