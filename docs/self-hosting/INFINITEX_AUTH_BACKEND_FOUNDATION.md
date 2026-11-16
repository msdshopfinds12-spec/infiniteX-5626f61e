# InfiniteX Authentication Backend Foundation

Status: **FOUNDATION IMPLEMENTED — NOT AN AUTHENTICATION SERVICE**

Branch: `feat/provider-neutral-billing-sandbox`

## Purpose

Establish a server-only configuration boundary before implementing OIDC callbacks, token exchange, sessions, or provider connectivity. The current Vite/React application is a browser frontend; browser code must never receive an OIDC client secret, signing key, database credential, or session secret.

## Current repository facts

- The root package is a React 18 + TypeScript 5 + Vite 5 frontend.
- Node.js >=22 is declared.
- The root package has no confirmed backend HTTP runtime or PostgreSQL driver dependency.
- OIDC discovery validation exists under `scripts/auth/`.
- This foundation adds pure Node.js server-side configuration validation under `server/auth/`.
- No identity provider is installed or configured by this change.

## Proposed target boundaries

```text
src/                         Browser-only React UI
  features/auth/              Login UX, loading/error states; no secrets
server/
  http/                       Future BFF HTTP composition
  auth/
    config.mjs                Implemented: server config validation
    oidc-client.mjs           Planned: maintained OIDC relying-party library
    transactions.mjs          Planned: state/nonce/PKCE single-use store
    callbacks.mjs             Planned: strict callback orchestration
    sessions.mjs              Planned: opaque session lifecycle
  security/                   Planned: CSRF, origin, headers, rate limits
  storage/                    Planned: repository interfaces and PostgreSQL
scripts/auth/
  validate-oidc-discovery.mjs Implemented: metadata shape/security validation
tests/auth/                   Node built-in test suite
docs/self-hosting/            Architecture and operational decisions
```

## Configuration contract

The implemented `loadAuthConfig()` reads only the supplied environment object and returns either:

- `{ ok: true, config }` with a frozen, normalized configuration; or
- `{ ok: false, errors }` without partial configuration.

Required variables:

| Variable | Meaning |
|---|---|
| `AUTH_ISSUER_URL` | Exact HTTPS issuer URL; no query, fragment or credentials |
| `AUTH_CLIENT_ID` | Server-side OIDC client identifier |
| `AUTH_REDIRECT_URI` | Exact callback URL |
| `AUTH_ALLOWED_ORIGINS` | Comma-separated trusted HTTPS origins |

HTTP is accepted only when the caller explicitly enables loopback development mode. Never enable that option in production.

## Security invariants for the next phases

1. Use a maintained OIDC client for discovery fetching, authorization-code exchange, JWKS handling and ID-token validation. Do not implement JWT/JWS/JWK cryptography manually.
2. Authorization Code + PKCE S256; exact redirect URI; state and nonce generated with a cryptographically secure random source.
3. Login transactions must expire and be consumed atomically exactly once.
4. Validate issuer, audience, authorized party where applicable, nonce, signature, algorithm, expiry and relevant token claims through the maintained library.
5. Keep provider secrets and session secrets server-side only; never expose them through Vite-prefixed variables or browser bundles.
6. Use opaque, high-entropy browser session identifiers; store only a cryptographic hash server-side.
7. Cookies: HttpOnly, Secure in production, SameSite appropriate to the callback flow, narrow Path, and bounded Max-Age.
8. Enforce CSRF and Origin checks on state-changing requests. Apply rate limits and generic authentication errors.
9. Database identity uniqueness is issuer + subject. Never use email as the immutable identity key.
10. Add migration review, transaction/concurrency tests, provider integration tests and security audit before release.

## Verification plan

- Unit tests: configuration validation, URL normalization, malformed and hostile values.
- Transaction tests: expiry, replay, state mismatch, nonce mismatch, concurrent consume.
- Integration tests: disposable local provider and synthetic accounts only.
- Adversarial tests: open redirect, issuer confusion, untrusted JWKS origin, callback replay, session fixation, CSRF and cookie flags.
- Release: human approval required; no production migration, merge, deployment or provider exposure by this foundation.

## Explicit non-goals

This commit does not start an HTTP server, perform OIDC login, exchange tokens, verify ID tokens, create sessions, connect to PostgreSQL, provision a provider, or change production infrastructure.
