# InfiniteX Phase 04B — Durable Authentication Design

**Status:** Design artifact only — NOT implemented, NOT migrated, NOT enabled.
**Runtime:** apps/api
**Provider:** Neutral; no identity provider selected.
**Cost target:** Existing Node.js, PostgreSQL and GitHub Actions only; no paid service is assumed.

## Objective
Turn Phase 04A session primitives into durable authentication without weakening PostgreSQL RLS. No protected route may be enabled until OIDC verification, durable session lookup, CSRF, Origin checks and workspace authorization are integrated.

## Security invariants
1. Never persist raw session tokens, OIDC state, OIDC nonce or authorization codes. Persist SHA-256 digests for lookup. PKCE verifier must be encrypted at rest and short-lived.
2. Session tokens are opaque, random (at least 256 bits), host-only, Secure, HttpOnly, SameSite=Lax, Path=/, and have no Domain attribute.
3. Login transactions are single-use and atomically consumed. Reject expired, replayed, unknown or malformed state.
4. Use Authorization Code + PKCE S256 only. Validate exact issuer, audience, signature, nonce, state, azp where required, iat, exp and redirect URI using a maintained OIDC library.
5. Identity key is exact (issuer, subject). Never auto-link by email. Unknown identities are denied by default.
6. PostgreSQL RLS remains authoritative for workspace data. A browser session is not itself a database identity assertion.
7. Never log tokens, codes, PKCE verifiers, cookies, secrets or raw callback URLs.
8. Fail closed. No in-memory session fallback in runtime code.

## Proposed persistence model — migration artifact only

### app_private.auth_sessions
- id uuid primary key
- user_id uuid references public.app_users(id) on delete restrict
- token_hash char(64) unique; lowercase SHA-256 hex only
- csrf_token_hash char(64)
- created_at, last_seen_at, expires_at timestamptz
- revoked_at timestamptz nullable
- Checks for digest format and expiry after creation; index active lookup by token hash and expiry.

### app_private.oidc_login_transactions
- id uuid primary key
- state_hash char(64) unique
- nonce_hash char(64)
- pkce_verifier_ciphertext bytea; encrypted using a separately managed server key
- redirect_uri text; exact registered URI, length bounded
- created_at, expires_at timestamptz
- consumed_at timestamptz nullable
- Checks for digest format and bounded lifetime (target 5–10 minutes); index pending transaction expiry cleanup.

## Access boundary
The ordinary API role must not receive broad direct access to private auth tables. Authentication bootstrap happens before a verified principal exists, so normal user/workspace RLS context is unavailable. Do not solve this with blanket BYPASSRLS.

Preferred approach: narrow fixed SECURITY DEFINER database functions owned by a dedicated NOLOGIN role, pinned search_path, explicit argument validation, no dynamic SQL, minimal table grants, and EXECUTE granted only to the API role. Alternative: a separate narrowly scoped auth database role/pool with no workspace-table access. Direct access through the general app role is rejected unless independently reviewed. Do not casually repurpose the existing identity verifier role.

## Repository contracts
Session repository: create({userId, tokenHash, csrfTokenHash, expiresAt}); findActiveByTokenHash(tokenHash, now); revokeByTokenHash(tokenHash, now). Persist only digests. Active lookup requires revoked_at IS NULL and expires_at > now. Revoke is idempotent. DB errors propagate; no memory fallback.

Login transaction repository: create({stateHash, nonceHash, pkceVerifierCiphertext, redirectUri, expiresAt}); consumeByStateHash(stateHash, now). Consumption must be a single atomic guarded UPDATE ... WHERE consumed_at IS NULL AND expires_at > now RETURNING ... . Concurrent callbacks: exactly one succeeds. Replay, expiry or malformed data returns generic denial.

## OIDC lifecycle
1. Browser navigates to API login-start endpoint.
2. API validates provider configuration: exact issuer, endpoints, client ID and redirect URI.
3. Generate independent random state, nonce and PKCE verifier; compute S256 challenge.
4. Persist state/nonce digests and encrypted PKCE verifier in a short-lived transaction.
5. Redirect to provider using Authorization Code + PKCE S256.
6. Callback atomically consumes state before code exchange.
7. Maintained OIDC library exchanges code and validates ID token signature, issuer, audience, nonce and time claims.
8. Resolve exact (issuer, subject) in identity_links. No email-based linking.
9. Create opaque local session for an active account; set secure cookie; redirect only to validated same-origin relative destination.
10. Middleware checks session expiry/revocation, CSRF for unsafe methods, strict Origin and constructs server-side principal.
11. Workspace membership and RLS authorization are resolved independently per request/transaction.

## Dependency gate
Approved candidate: openid-client@6.9.0. It is NOT installed. Add only through npm in a network-enabled trusted environment and commit generated package.json and package-lock.json together. Never hand-edit lockfile integrity. Verify exact-version API and Node engine compatibility before integration.

## Free-first alternatives
- Existing PostgreSQL + Node built-ins + GitHub Actions: preferred if current quotas suffice.
- Self-hosted OIDC: infrastructure and operations overhead; not selected.
- Hosted identity provider free tier: limits and terms can change; requires explicit selection and review.
- Custom OAuth/OIDC/JWT implementation: rejected due cryptographic protocol risk.
No architecture can promise unlimited free compute, tokens, storage or bandwidth. Use quotas and budget alerts where supported.

## Non-goals and release restrictions
- Do not apply any migration.
- Do not provision an identity provider or create credentials.
- Do not add secrets to GitHub.
- Do not deploy, merge, publish or enable protected routes.

## Acceptance criteria
- [ ] Exact OIDC dependency and npm-generated lockfile committed.
- [ ] Private schema/functions reviewed; no blanket runtime BYPASSRLS.
- [ ] Atomic one-time login transaction consumption tested under concurrency.
- [ ] Durable session create/read/revoke/expiry tested against disposable PostgreSQL.
- [ ] OIDC issuer/audience/signature/nonce/state/PKCE/redirect validation tests pass.
- [ ] Unknown identity and disabled account denied.
- [ ] CSRF and strict Origin tests pass for unsafe methods.
- [ ] Session fixation, replay, cookie scope, logout and token-leakage tests pass.
- [ ] Workspace RLS isolation suite remains green.
- [ ] CI green on exact branch head; independent security review completed.
- [ ] Human explicitly approves release.

**Current truth:** Phase 04A primitives exist. CI passed on c643a965734d960cbbc05f99efe1d24f9ad62ca6. Phase 04B remains design-only until implementation commits and CI evidence exist.