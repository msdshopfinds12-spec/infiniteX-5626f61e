# Owner-Only Security Requirement

**Status: REQUIRED ARCHITECTURE / NOT YET VERIFIED OR ENFORCED END-TO-END**

INFINITEGX.7 is intended to be a private, single-owner system. The sole owner must be the only authorized human account across the dashboard, mobile clients, API, administration, and recovery flows.

## Mandatory controls
1. No public registration, guest accounts, shared default accounts, or self-service role elevation.
2. One explicitly provisioned owner identity; owner identity must be established through a trusted authentication provider or a secure bootstrap procedure, never from an arbitrary client-supplied header.
3. Strong authentication with MFA or passkeys where supported; secure session rotation, expiry, revocation, and CSRF protections for cookie sessions.
4. Server-side authorization on every protected API and administrative operation. Hiding UI controls is not authorization.
5. Bind the authenticated principal to the single configured owner and tenant. Do not trust X-Tenant-ID or tenant IDs inside request bodies as proof of authorization.
6. Least-privilege service credentials, encrypted secrets, key rotation, and no secrets in source control, logs, or frontend bundles.
7. Audit authentication, authorization denials, credential changes, approvals, data exports, and destructive operations without logging secrets.
8. Owner-controlled recovery with offline recovery codes and documented account recovery; no hidden support/admin bypass in the application.
9. Deny by default when owner identity, auth configuration, or policy state is missing or invalid. Health checks may expose only non-sensitive status.
10. Repository, hosting, DNS, domain, database, backups, and provider accounts must be secured separately with owner-controlled accounts and MFA.

## Verification gates
- Anonymous requests to every protected endpoint are rejected.
- A non-owner identity is rejected even if it supplies the owner's tenant ID.
- Spoofed owner IDs, tenant headers, role claims, and request-body fields cannot elevate privileges.
- Session revocation and MFA/passkey behavior are tested against the chosen identity provider.
- Database row-level security is tested against real PostgreSQL using distinct roles and tenants.
- Frontend and mobile clients cannot bypass backend authorization.
- Secret scanning, dependency review, backup restore, and access review pass before production deployment.

## Important limitation
A single-owner application does not mean hosting, repository, identity, database, DNS, or AI providers have zero technical access. Those provider accounts and encryption keys require separate controls. No system can honestly promise absolute immunity from compromise.
