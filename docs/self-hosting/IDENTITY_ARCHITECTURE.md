# InfiniteX Identity and Session Architecture

**Status:** PROPOSED — design only; not implemented or tested.  
**Preferred direction:** OIDC identity provider evaluation; InfiniteX retains authorization.

## Goals
- Avoid inventing a custom password and account-recovery system without specialist review.
- Establish a clear identity boundary before protected features.
- Enforce workspace membership and resource ownership on the server.
- Keep browser and Android-native authentication flows distinct.
- Minimize personal data and use synthetic accounts during testing.

## Proposed OIDC request flow
1. Browser begins Authorization Code + PKCE with the approved OIDC provider.
2. Provider authenticates the user and returns an authorization code.
3. Backend validates issuer, audience, signature, state, nonce, expiry and PKCE binding.
4. Backend maps the trusted issuer + subject pair to a local user identity.
5. Backend creates a local session under the approved cookie policy.
6. Each protected request resolves a trusted principal and checks local workspace membership and resource permissions.
7. Logout revokes the local session and follows the provider logout policy where applicable.

OIDC authenticates identity; it does not determine local workspace ownership or grant every application permission.

## Browser session controls
- Evaluate Secure, HttpOnly, SameSite cookies with Path=/ and no Domain attribute unless justified.
- A __Host- cookie name may be used in production when compatible with deployment.
- Never store bearer/session tokens in localStorage, URLs or JavaScript-readable state.
- Protect cookie-authenticated mutations with CSRF defenses and strict Origin validation.
- Use exact allowed CORS origins; never wildcard credentialed CORS.
- HTTPS is mandatory outside local loopback development.
- Rotate and revoke local sessions after security-sensitive changes.

## Android-native client
Use the system browser and Authorization Code + PKCE. Do not embed a client secret in the Android app. Review redirect URI ownership, app-link verification, token storage and logout separately before implementation. Do not assume browser cookie behavior is suitable for a native client.

## Authorization model
Use the existing workspace role proposal as the baseline:
- owner
- admin
- member
- viewer

Rules:
- Deny by default.
- Check workspace membership on every workspace-scoped operation.
- Never trust client-supplied user ID, role, workspace ID or ownership claims without server verification.
- Hidden UI controls are not authorization.
- Separate platform operators from workspace roles.
- Privileged actions require explicit policy and audit records.
- Support access to private user content is not implicit.

## Proposed identity/session lifecycle
- Map identities by unique issuer + subject.
- Maintain explicit local account status and timestamps.
- Store only the minimum OIDC subject/issuer metadata needed.
- If opaque local sessions are used, store only a hash of the random session token, plus expiry and revocation state.
- Password recovery and MFA are delegated to the selected provider unless a later approved design says otherwise.
- Account deletion and export require a retention and recovery policy.

## Abuse and resilience controls
- Rate-limit login initiation and callback abuse at the appropriate boundary.
- Validate state, nonce, PKCE, issuer, audience, signature and expiry.
- Redact authorization codes, tokens, cookies and provider payload secrets from logs.
- Enforce request limits, timeouts and generic external errors.
- Revoke local sessions on account disablement and suspected compromise.
- Treat provider metadata and claims as untrusted until cryptographically validated.

## Deferred
Provider selection, provider installation, email delivery, custom password auth, MFA/passkeys configuration, organization tenancy, support impersonation and production federation are not yet approved.

## Acceptance criteria before implementation
- Select and approve the OIDC provider and operational owner.
- Approve browser and Android redirect/session flows.
- Define role/permission matrix and tenant isolation invariants.
- Approve schema, retention, deletion, backup and restore policies.
- Review framework and database dependencies.
- Synthetic tests cover invalid issuer/audience/signature, state/nonce/PKCE failure, session expiry/revocation, cross-workspace access and privilege escalation.
