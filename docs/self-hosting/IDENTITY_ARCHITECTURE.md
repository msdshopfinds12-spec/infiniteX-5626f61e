# InfiniteX Identity and Session Architecture

**Status:** PROPOSED — design only; not implemented or tested.

## Goals
- Establish a small, auditable identity boundary before protected features.
- Default-deny access and enforce authorization on the server.
- Keep browser sessions revocable and independent from client-side role claims.
- Minimize personal data and avoid unnecessary third-party identity dependencies.
- Use synthetic test accounts only until privacy and operational controls are approved.

## Proposed request flow
1. Browser submits credentials over HTTPS to the API.
2. API validates request size, schema, origin and rate limits.
3. API loads the account by normalized login identifier and verifies the password hash using a reviewed implementation.
4. API creates a cryptographically random opaque session token.
5. Only a one-way hash of the token is persisted. Raw token is returned only in a Secure, HttpOnly, SameSite cookie.
6. On each protected request, API hashes the cookie token, loads the active session and account, checks expiry/revocation, then constructs a server-side principal.
7. Authorization policy checks permissions and resource ownership before domain services run.
8. Logout revokes the server-side session and clears the cookie.

## Cookie and browser controls
- Production cookie: Secure, HttpOnly, SameSite=Lax or stricter based on final navigation flow; Path=/; omit Domain unless justified.
- Use a __Host- prefixed cookie name in production where compatible with deployment.
- Do not store session identifiers in localStorage, sessionStorage, URLs, or JavaScript-readable state.
- Protect state-changing cookie-authenticated requests with a CSRF token strategy and strict Origin/Referer validation.
- Configure exact allowed origins; never use wildcard CORS with credentials.
- HTTPS is mandatory outside local loopback development.
- Rotate the session after successful authentication and privilege changes.

## Account lifecycle
Initial scope proposal:
- Create accounts only after server-side validation and uniqueness checks.
- Store a normalized login identifier and password hash; never store plaintext passwords.
- Account states: pending_verification, active, locked, disabled.
- Login errors should not reveal whether an account exists.
- Support logout current session; later add revoke-all-sessions.
- Password recovery and email verification remain deferred until an approved mail-delivery design exists.
- Account deletion and data export require a separately documented retention and recovery policy.

## Authorization model
Use server-derived permissions, not client-provided roles.
- user: access only to resources owned by the authenticated account.
- support: no implicit access to private user content; exceptional access must be time-bound, justified, audited and separately approved.
- admin: restricted operational role; require stronger authentication and audited privileged actions.
- No public self-registration as admin.
- Role assignment must be an explicit privileged operation and create an audit event.
- Every resource query must scope by authenticated owner or an explicitly authorized relationship. Random IDs are not authorization.

## Abuse and resilience controls
- Rate-limit login, registration and recovery by multiple signals, with privacy-preserving storage and conservative lockout behavior.
- Add bounded request body size, request timeout and generic error responses.
- Use constant-time password-hash verification behavior as provided by the vetted library.
- Record security events without recording passwords, raw session tokens, cookies or reset secrets.
- Revoke sessions on password change, account disablement and suspected compromise.
- If recovery tokens are later implemented, make them one-time, hashed at rest, short-lived and purpose-bound.

## Deferred
MFA/passkeys, OAuth/OIDC, email delivery, password reset, device fingerprinting, social login, organization tenancy and support impersonation are out of initial scope.

## Acceptance criteria before implementation
- Framework and password-hashing dependencies reviewed and approved.
- Threat model and data schema approved.
- Cookie, CSRF, CORS and HTTPS behavior defined for each deployment profile.
- Authorization matrix covers every planned endpoint and resource.
- Synthetic tests cover session expiry, revocation, account states, CSRF, origin checks, ownership and privilege escalation.
- No real personal data is used during initial validation.
