# InfiniteX OIDC Integration Blueprint and Proof-of-Concept Plan

Status: PLAN ONLY — no dependencies installed and no authentication code added.
Target: React + TypeScript + Vite frontend, Node API foundation, private PostgreSQL.
Identity provider: undecided.

## 1. Runtime boundaries

React Web / Android Native
  -> system browser + Authorization Code / PKCE
  -> selected OIDC Provider
  -> InfiniteX API (trusted relying party)
  -> local session + authorization service
  -> PostgreSQL (private network)

The client is not trusted to assert identity, workspace role or permissions. The API validates identity and enforces authorization.

## 2. Browser client
- Prefer a Backend-for-Frontend (BFF) design.
- API initiates OIDC and stores short-lived state, nonce and PKCE transaction data.
- API handles callback and token exchange.
- API creates an opaque local session and sets Secure, HttpOnly, SameSite cookie.
- Browser JavaScript never receives provider refresh tokens.
- Cookie-authenticated mutations require CSRF defenses and strict Origin validation.
- Do not store long-lived tokens in localStorage.

## 3. Android native client
- Use the system browser, not an embedded webview.
- Use a public OIDC client with Authorization Code + PKCE S256.
- Never embed a client secret in APK, source, build configuration or remote configuration.
- Review verified HTTPS app links or carefully registered URI schemes.
- Review secure token storage, logout and account switching separately.

## 4. Protocol transaction requirements
At login initiation:
- Generate cryptographically random state, nonce and PKCE verifier.
- Use S256 challenge and exact registered redirect URI.
- Bind transaction to initiating session and short expiry.
- Store transaction data server-side or in a reviewed integrity-protected mechanism.

At callback:
- Reject missing, expired, replayed or mismatched state.
- Verify ID-token nonce.
- Exchange code using original PKCE verifier.
- Validate signature with trusted issuer JWKS and explicit algorithm allowlist.
- Validate exact issuer, audience, expiry and relevant time claims.
- Reject unexpected redirect URI, issuer or token type.
- Resolve local identity by exact issuer + subject; never email-only linking.
- Redact codes, tokens, cookies and provider payloads from logs.

Use a maintained, reviewed OIDC client library. Do not implement JWT signature verification, JWK rotation or OAuth protocol parsing from scratch.

## 5. Proposed TypeScript domain contract

These are design examples, not compiled code:

    export type AuthenticatedPrincipal = Readonly<{
      userId: string;
      issuer: string;
      subject: string;
      sessionId: string;
      authenticatedAt: string;
    }>;

    export type WorkspaceRole =
      | "owner" | "admin" | "member" | "viewer";

    export type AuthorizationResult =
      | { allowed: true; role: WorkspaceRole; policyVersion: string }
      | { allowed: false; reason: "NO_MEMBERSHIP" | "ROLE_INSUFFICIENT" | "RESOURCE_OUT_OF_SCOPE" | "ACCOUNT_DISABLED" };

TypeScript types do not enforce security at runtime. Validate inputs and resolve roles from trusted server-side persistence.

## 6. Proposed module layout (after approval)

    apps/api/src/
      app.ts
      server.ts
      config/env.ts
      modules/identity/
        identity.routes.ts
        oidc.client.ts
        oidc.callback.ts
        identity.repository.ts
        identity.service.ts
        identity.schemas.ts
      modules/sessions/
        session.repository.ts
        session.service.ts
        session.cookies.ts
        csrf.ts
      modules/authorization/
        principal.ts
        permissions.ts
        policy.ts
        workspace.guard.ts
      infrastructure/database/
        pool.ts
        transaction.ts
      infrastructure/logging/redaction.ts
      security/rate-limit.ts

Keep identity protocol code separate from workspace authorization. Do not introduce microservices or Redis without a measured requirement.

## 7. Endpoint contract proposal

| Method | Path | Purpose | Access |
|---|---|---|---|
| GET | /auth/oidc/start | Begin login | Public, rate-limited |
| GET | /auth/oidc/callback | Complete OIDC flow | Public callback with transaction validation |
| POST | /auth/logout | Revoke local session | Authenticated + CSRF |
| GET | /auth/session | Minimal current session view | Authenticated |
| GET | /workspaces/:workspaceId | Read workspace | workspace:read |
| POST | /workspaces/:workspaceId/members | Invite member | member:invite |
| PATCH | /workspaces/:workspaceId/members/:userId | Change role | member:role:update |
| POST | /workspaces/:workspaceId/transfer | Transfer ownership | Owner + recent re-auth + confirmation |

No endpoint above exists yet. Do not implement until provider, API framework and session model are approved.

## 8. Persistence invariants
- Unique identity mapping: (issuer, subject).
- Unique membership: (workspace_id, user_id).
- Runtime database role cannot alter schema.
- Membership changes and audit event write commit atomically.
- Last-owner removal/demotion is rejected transactionally.
- If local sessions are selected, persist only a cryptographic hash of a random opaque token.
- Queries must scope by workspace and resource ownership.
- No raw access tokens, refresh tokens, authorization codes, passwords or secrets in database or logs.

## 9. Proof-of-concept tests

Protocol:
- Valid authorization code + PKCE S256 succeeds.
- Missing, wrong or replayed state fails.
- Wrong nonce fails.
- Wrong issuer, audience, signature, algorithm or expiry fails.
- Redirect URI mismatch and code replay fail.

Sessions:
- HTTPS cookie has Secure, HttpOnly, SameSite and narrow Path attributes.
- Session rotates after login and privilege elevation.
- Logout revokes session; expired/revoked session fails.
- CSRF and invalid Origin mutations fail.

Authorization:
- No membership is denied.
- Viewer cannot mutate; member cannot grant roles.
- Admin cannot transfer ownership.
- Last owner cannot be removed.
- Cross-workspace ID substitution is denied.
- Background job without explicit workspace scope is denied.

Operations:
- Logs redact cookies, tokens, authorization codes and secrets.
- Provider outage fails closed for protected routes.
- Graceful shutdown closes database pool.
- Backup restore succeeds on disposable synthetic data.

## 10. Exit criteria
- Provider and exact version approved.
- Dependencies and licenses reviewed.
- Browser and Android flows tested.
- Protocol tests pass with inspected CI evidence.
- Tenant-isolation negative tests pass.
- Backup/restore and upgrade procedure demonstrated.
- No unresolved critical/high security findings.

## 11. Explicit non-goals
No custom password system, live onboarding, email/SMS delivery, production host, public ingress, migration, real personal data, payment integration or deployment in this phase.