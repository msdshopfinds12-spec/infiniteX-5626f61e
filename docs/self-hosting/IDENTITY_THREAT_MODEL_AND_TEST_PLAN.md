# InfiniteX Identity Threat Model and Test Plan

**Status:** Design and test plan only. No identity controls are implemented or verified.  
**Identity direction:** OIDC provider evaluation; InfiniteX enforces local authorization.

## Assets
- Local user and OIDC issuer/subject mappings.
- Authorization-code flow state, nonce and PKCE verifier during transient processing.
- Local session metadata and token hashes, if local sessions are selected.
- Workspace memberships, roles and user-owned application records.
- Security and administrative audit events.
- Provider client configuration, database credentials, backup keys and application secrets.

## Trust boundaries
1. Untrusted browser or Android client to OIDC provider.
2. Client/provider callback to InfiniteX API.
3. API process to PostgreSQL.
4. Ordinary workspace member to privileged workspace/platform operations.
5. Application host to backup storage.
6. AI-generated content/tool requests to privileged application actions.

## Threats and required mitigations
| Threat | Required control | Verification evidence |
|---|---|---|
| Authorization-code interception | Authorization Code + PKCE; exact redirect URI | Callback and PKCE negative tests |
| Login CSRF / account mix-up | State, nonce, issuer and audience validation | Invalid state/nonce/issuer tests |
| Forged identity claims | Validate signature, issuer, audience, expiry and allowed algorithms | Invalid signature/claim tests |
| Session theft | Secure HttpOnly cookie; opaque token; hash at rest if local sessions used | Cookie and database assertions |
| Session fixation | Rotate local session after authentication and privilege changes | Before/after session tests |
| CSRF | CSRF token plus strict Origin validation for cookie-authenticated writes | Cross-origin mutation tests |
| XSS-assisted token theft | HttpOnly cookie, output encoding, CSP | Browser security tests |
| IDOR / broken object authorization | Server-side workspace membership and ownership predicates | Cross-workspace access tests |
| Privilege escalation | Server-side role checks; no client-authoritative roles | Role-boundary tests |
| Account linking takeover | Unique issuer + subject; no email-only automatic linking | Identity-linking negative tests |
| Secret leakage | Redaction; no tokens/codes/secrets in logs | Captured-log assertions |
| Database compromise | Least-privilege roles, private network, encrypted backups | Role inspection and restore exercise |
| AI prompt/tool abuse | Allowlisted tools, schema validation, scoped authorization, approval gates | Adversarial tool-call tests |

## Required test layers

### Unit
- OIDC claim validation policy.
- Identity mapping by exact issuer + subject.
- Session expiry and revocation decisions, if local sessions are used.
- Role/permission evaluation.
- Workspace membership and resource ownership policy.

### API integration
- Valid callback completes only with valid state, nonce and PKCE.
- Wrong issuer, audience, signature, expiry or redirect URI is rejected.
- Duplicate issuer + subject mapping is rejected or resolved deterministically.
- Email similarity alone cannot silently link two identities.
- Logout revokes the local session, if applicable.
- Expired and revoked sessions are rejected.
- CSRF and Origin checks reject invalid mutations.
- CORS allows only configured origins.
- User A cannot read, update or delete User B's workspace resources without explicit membership.
- Viewer/member roles cannot perform owner/admin operations.
- Oversized bodies, malformed JSON and unsupported content types fail safely.

### Database
- Unique issuer + subject is enforced under concurrency.
- Unique workspace + user membership is enforced.
- Foreign keys prevent orphan identity links and memberships.
- Last-owner invariant is enforced transactionally.
- Runtime DB role cannot perform schema changes.
- Migration role is unavailable to runtime process.
- Backup restore produces a consistent synthetic test database.

### Operational
- Health and readiness distinguish process liveness from database readiness.
- Logs include request correlation IDs but exclude authorization codes, tokens, cookies and secrets.
- Rate limits and resource bounds work under synthetic load.
- Graceful shutdown closes connections without corrupting transactions.
- OIDC provider updates, backup and recovery responsibilities are documented.

## Release-blocking findings
Any unvalidated OIDC signature/issuer/audience, missing state/nonce/PKCE check, unsafe identity linking, missing workspace ownership check, client-authoritative role, wildcard credentialed CORS, public database port, unreviewed admin bootstrap, or secret in Git is a release blocker.

## Evidence policy
A test is VERIFIED only when the command or CI run actually executes and its result is inspected. A written test plan is NOT TESTED. No production-readiness claim is permitted from documentation alone.
