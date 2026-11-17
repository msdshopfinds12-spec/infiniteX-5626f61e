# GH-16 — Security Plan and Threat Model

**Status:** Planning document; no security certification or production audit is implied.

## 1. Scope

Protect user identity, workspace data, API sessions, provider credentials, database access, and operational integrity across the InfiniteX frontend and proposed API.

## 2. Assets

- Authentication credentials and session material.
- Workspace membership, roles, and business data.
- Agent configuration and task payloads.
- Provider/API credentials.
- Audit and operational logs.
- Deployment configuration and environment secrets.

## 3. Trust boundaries

1. Browser/mobile client → public API.
2. API → identity provider.
3. API → PostgreSQL.
4. API → external AI/provider adapters.
5. CI runner → repository and build artifacts.
6. Operator → deployment and secret-management controls.

Treat all client input, external provider output, repository content, and environment configuration as untrusted until validated.

## 4. Threats and required controls

| Threat | Required control | Verification evidence |
|---|---|---|
| Broken access control / IDOR | Server-side workspace and resource policy; deny by default | Cross-tenant negative tests |
| Session theft | Secure cookie flags, rotation, expiration, revocation | Session lifecycle tests |
| CSRF | Appropriate token/origin strategy for cookie-authenticated writes | CSRF integration tests |
| Injection | Parameterized queries and strict validation | Integration/security tests |
| Secret exposure | Environment/secret store; redact logs; scan repository | Secret scan and code review |
| Brute force/abuse | Rate limits and bounded request sizes | Rate-limit tests |
| Unsafe provider response | Timeouts, schema validation, output handling | Adapter contract tests |
| Dependency compromise | Lockfiles, updates, audit, license review | CI reports |
| Data leakage in logs | Structured redaction and minimal logging | Log inspection tests |
| Unsafe deployment | Protected release process and human approval | Release checklist |

## 5. Identity and session rules

- Never trust a user ID, role, or workspace membership supplied by the browser.
- Validate identity assertions cryptographically and enforce issuer/audience/expiry as appropriate.
- Session tokens must be high entropy, opaque where appropriate, stored safely, rotated, expired, and revocable.
- Cookie sessions should use Secure, HttpOnly, and an intentional SameSite policy.
- Apply CSRF protections to state-changing cookie-authenticated requests.
- Logout must revoke the server-side session.
- Production identity provider remains a decision gate; test-only identity adapters must not be enabled in production.

## 6. Authorization model

Use a policy matrix with at least:
- Anonymous
- Authenticated member
- Workspace admin
- Workspace owner
- Service identity (only if justified)

For every protected operation define:
- Required identity.
- Workspace membership requirement.
- Role requirement.
- Resource ownership rule.
- Denial behavior.
- Audit event requirement.

Database RLS can provide defense in depth, but it does not replace API authorization. Test both layers and ensure application connection roles cannot bypass intended restrictions.

## 7. Database safety

- Least-privilege roles.
- Parameterized statements.
- Foreign keys and uniqueness constraints.
- Workspace scoping and indexes based on actual query patterns.
- Migration review and rollback notes.
- Backups/restore process before production data changes.
- Never run production migrations in this planning phase.

## 8. Provider adapter safety

- No API keys in frontend bundles.
- Provider secrets remain server-side.
- Timeouts and bounded retries.
- Validate response shape and size.
- Normalize errors without returning provider secrets.
- Apply per-user/workspace quotas where appropriate.
- Document data retention and provider privacy implications before enabling a provider.
- Keep billing and paid provider features disabled unless explicitly approved.

## 9. Frontend security and UX

- Do not render untrusted HTML.
- Avoid unsafe dynamic URL handling.
- Keep auth/session secrets out of local storage where possible.
- Clearly distinguish demo data from live backend data.
- Accessible error states must not expose sensitive internals.
- Use dependency pinning and review third-party scripts.

## 10. CI and repository controls

- Secret scanning and dependency review.
- Required tests before merge where repository settings permit.
- Protect default branch and require review/status checks as an explicit governance task.
- Review workflow permissions; prefer least-privilege tokens.
- Pin third-party GitHub Actions to immutable SHAs where feasible.
- Do not store credentials in workflow YAML or repository files.

## 11. Security release gates

No production release until:
- No unresolved critical/high security findings.
- Cross-workspace tests pass.
- Session/CSRF tests pass where applicable.
- Secret scan is clean or exceptions are reviewed.
- Dependencies and workflow permissions are reviewed.
- Production identity and database configuration are validated.
- Rollback and incident contacts/process are documented.
- Human release approval is recorded.

## 12. Limitations

This document is not a penetration test, compliance assessment, or guarantee of security. Security status remains **NOT VERIFIED** until implementation and reproducible tests support each claim.
