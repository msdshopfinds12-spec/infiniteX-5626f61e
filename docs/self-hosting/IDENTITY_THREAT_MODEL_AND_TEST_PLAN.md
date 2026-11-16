# InfiniteX Identity Threat Model and Test Plan

**Status:** Design and test plan only. No identity controls are implemented or verified.

## Assets
- Account identifiers and password hashes.
- Session token hashes and active session state.
- Account status and role assignments.
- User-owned application records.
- Security and administrative audit events.
- Database credentials, backup keys and application secrets.

## Trust boundaries
1. Untrusted browser/device to public API.
2. API process to PostgreSQL.
3. Ordinary account principal to privileged operations.
4. Application host to backup storage.
5. AI-generated content/tool requests to privileged application actions.

## Threats and required mitigations
| Threat | Required control | Verification evidence |
|---|---|---|
| Credential stuffing | Rate limits, generic errors, safe throttling | Repeated-login integration tests |
| Password database exposure | Strong password hashing; no plaintext | Hash format review and fixture tests |
| Session theft | Opaque high-entropy tokens, hashed at rest, Secure HttpOnly cookie | Cookie and database assertions |
| Session fixation | Rotate session after login and privilege change | Before/after token tests |
| CSRF | CSRF token plus Origin validation | Cross-origin mutation tests |
| XSS-assisted token theft | HttpOnly cookie, output encoding, CSP | Browser security tests |
| IDOR / broken object authorization | Server-side ownership predicates | Cross-account resource tests |
| Privilege escalation | Server-side role checks; no public admin assignment | Role-boundary tests |
| Account enumeration | Uniform login and recovery responses | Response equivalence tests |
| Recovery-token replay | One-time hashed token and expiry (future scope) | Replay/expiry tests |
| Secret leakage | Redaction and no secrets in logs | Captured-log assertions |
| Database compromise | Least-privilege roles, private network, encrypted backups | Role inspection and restore exercise |
| AI prompt/tool abuse | Allowlisted tools, schema validation, scoped authorization, approval gates | Adversarial tool-call tests |

## Required test layers

### Unit
- Login identifier normalization and validation.
- Password policy and hash/verify behavior.
- Session expiry and revocation decisions.
- Role/permission evaluation.
- Resource ownership policy.

### API integration
- Valid login creates a session cookie with required flags.
- Invalid credentials return generic responses.
- Disabled/locked accounts cannot authenticate.
- Logout revokes the session.
- Expired and revoked sessions are rejected.
- Password change revokes all active sessions.
- CSRF and Origin checks reject invalid mutations.
- CORS allows only configured origins.
- User A cannot read, update or delete User B's resources.
- Ordinary users cannot grant roles or access admin routes.
- Oversized bodies, malformed JSON and unsupported content types fail safely.

### Database
- Unique login identifier is enforced under concurrency.
- Foreign keys prevent orphan sessions and roles.
- Transactions roll back completely on failure.
- Runtime DB role cannot perform schema changes.
- Migration role is unavailable to runtime process.
- Backup restore produces a consistent test database.

### Operational
- Health and readiness distinguish process liveness from database readiness.
- Logs include request correlation IDs but exclude secrets.
- Rate limits and resource bounds work under synthetic load.
- Graceful shutdown closes connections without corrupting transactions.

## Release-blocking findings
Any plaintext password or token, missing ownership check, client-authoritative role, wildcard credentialed CORS, public database port, unreviewed admin bootstrap, or secret in Git is a release blocker.

## Evidence policy
A test is VERIFIED only when the command or CI run actually executes and its result is inspected. A written test plan is NOT TESTED. No production-readiness claim is permitted from documentation alone.
