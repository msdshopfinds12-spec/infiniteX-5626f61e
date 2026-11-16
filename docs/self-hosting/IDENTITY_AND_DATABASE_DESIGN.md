# Identity and Database Design — Proposal

Status: design only. No identity provider, database driver, schema, migration or credentials have been added. Target: self-hosted modular monolith with private PostgreSQL. Use synthetic test data only until privacy, ownership and retention policies are reviewed.

## 1. Recommended direction

Prefer a mature OpenID Connect (OIDC) identity provider over inventing password storage, recovery and MFA. Evaluate self-hostable providers in a separate deployment review. Do not install or expose an identity provider as part of this design-only milestone.

The API remains the authorization enforcement point. A successful login does not grant access to every resource; every request must be authorized against its workspace and resource.

### Alternatives

| Option | Advantages | Trade-offs | Recommendation |
|---|---|---|---|
| Self-hosted OIDC | Mature login/session protocols; less custom credential code | Updates, backups and operations | Preferred for production evaluation |
| Managed OIDC | Lower operations burden | External dependency, pricing and data-processing review | Optional, not required |
| Custom password auth | Full control | High burden: hashing, reset, MFA, sessions and abuse controls | Avoid without specialist review |
| Development mock identity | Fast and credential-free | Not real authentication | Tests only; never production |

## 2. Identity flow

1. Client redirects to approved OIDC provider.
2. Provider authenticates and returns an authorization code.
3. API validates issuer, audience, signature, state, nonce and PKCE flow.
4. Server creates or updates local identity mapping.
5. Server issues a session under the reviewed cookie/token policy.
6. Every protected request validates session and authorization.

Do not store provider access tokens in browser localStorage. For same-site web sessions, evaluate Secure, HttpOnly, SameSite cookies and appropriate CSRF defenses. Android native clients need a separate reviewed flow.

## 3. Authorization model

Initial roles: owner, admin, member, viewer.

Rules:
- Deny by default.
- Check workspace membership on every workspace-scoped query.
- Never trust client-supplied user ID, role, workspace ID or ownership claims without server verification.
- Hidden UI controls are not authorization.
- Separate platform operators from workspace roles.
- Privileged actions require explicit policy and audit records.

## 4. Proposed relational entities

Logical model only; not executable SQL.

| Entity | Purpose | Constraints |
|---|---|---|
| users | Local user identity | Internal UUID |
| identity_links | OIDC issuer/subject mapping | Unique issuer + subject; no secrets |
| workspaces | Tenant boundary | UUID and timestamps |
| workspace_memberships | User-to-workspace role | Unique workspace + user |
| sessions | Server-side session metadata, if opaque sessions are chosen | Hashed session identifier, expiry, revocation |
| audit_events | Security event history | Append-only application interface; bounded retention |
| api_clients | First-party service identities, if needed | Scoped credentials; hashed secrets; rotation metadata |

Do not store plaintext passwords, provider client secrets, raw bearer tokens or payment credentials. If OIDC owns credentials, do not duplicate password hashes.

## 5. PostgreSQL rules

- UUID primary keys and timestamptz event times.
- Foreign keys and unique constraints enforce ownership invariants.
- Index actual query patterns, not guesses.
- Parameterized SQL only.
- Least-privilege database role for API; separate migration owner role.
- Private database network.
- Encrypted backups and tested restore procedures.
- Define retention/deletion before collecting real personal data.

## 6. Session and account security

- OIDC Authorization Code + PKCE.
- Validate issuer, audience, signature, expiry, state and nonce.
- Short-lived sessions with rotation and revocation.
- Secure, HttpOnly, SameSite cookies for browser sessions.
- CSRF protection for cookie-authenticated writes.
- Rate limits and abuse monitoring at authentication boundaries.
- Account recovery delegated to identity provider.
- Evaluate MFA before production.
- No secrets in source control or frontend bundles.

## 7. API authorization contract

Every protected handler receives a verified principal from trusted middleware and declares required authentication, permission, workspace/resource scope, approval requirement and audit event type.

The data-access layer must include tenant scope in every query. Never fetch globally and rely on the frontend to hide unauthorized records.

## 8. Test matrix

- Unauthenticated, expired, revoked and malformed sessions are rejected.
- Wrong issuer/audience/signature is rejected.
- Cross-workspace access is denied.
- Client role escalation is ignored.
- Missing membership is denied.
- Session rotation invalidates old session as designed.
- CSRF policy is enforced for cookie-authenticated writes.
- Audit events do not log secrets.
- Database constraints reject duplicate membership and orphan references.

## 9. Approval gates

Before implementation, approve:
1. OIDC provider and operational owner.
2. Browser and Android session strategy.
3. Role/permission matrix.
4. Data fields, retention and deletion policy.
5. PostgreSQL schema and indexes.
6. Backup/restore and migration procedure.

Until then: no provider installation, client secret, database connection, migration, production account, public ingress or real personal data.
