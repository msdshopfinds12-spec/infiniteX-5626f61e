# InfiniteX Advanced Security Architecture

**Status:** Engineering baseline and CI enforcement proposal implemented on an isolated diagnostic branch.  
**Scope:** Repository source and disposable CI only. No live Supabase configuration, production secrets, schema migrations, deployment, merge, or paid infrastructure is changed by this document.

## 1. Security objectives

1. Authenticate every protected request at a trusted server boundary.
2. Derive the subject identity from a verified provider session; never trust a browser-supplied owner ID.
3. Enforce authorization at the database/API boundary. UI authorization snapshots are display hints, not access controls.
4. Deny by default and scope every read/write to the authenticated owner or explicitly authorized service principal.
5. Keep privileged credentials and signing/encryption keys out of browser bundles, logs, test fixtures, and repository history.
6. Bound request size, execution time, retries, queue concurrency, and resource consumption.
7. Make security behavior testable in CI and distinguish source-level evidence from live-environment verification.
8. Preserve recoverability through verified backups and rehearsed restore procedures.

## 2. Architecture mapped to the current stack

| Layer | InfiniteX implementation / target | Evidence status |
|---|---|---|
| Browser client | React + Vite; only Supabase URL and publishable key are public | Source contract exists; browser-secret regression test exists |
| Identity | Supabase Auth adapter; identity epoch fences stale asynchronous UI work | Source and unit tests exist |
| Authorization | Database RLS and server-side owner checks; UI capability snapshot is not authoritative | Worker owner checks exist; full live RLS verification remains outstanding |
| Edge/API boundary | Supabase Edge Functions; bearer token validated with `auth.getUser`; cron secret verified server-side | Shared boundary and regression tests exist |
| CORS | Exact-origin allowlist; no wildcard or substring matching | Helper and regression tests exist |
| Workflow execution | Owner-scoped lease claims, attempt generations, lease-fenced transitions | Disposable PostgreSQL integration tests exist; complete workflow must pass |
| Secrets | Server-side Supabase secrets/Vault; service-role credentials never enter browser source | Browser secret-boundary test exists; live settings not inspected here |
| Data protection | Platform-managed transport/storage controls plus application-level encryption only where justified | Deployment configuration and key lifecycle require separate review |
| Monitoring | Structured, redacted security events and provider/platform logs | Partial; durable SIEM/WORM integration is not implemented by this branch |
| Recovery | Encrypted backups, integrity verification, safe restore rehearsal | Design target; no production backup is claimed verified |
| Supply chain | Locked dependencies, vulnerability audit, CycloneDX SBOM in CI | CI gate added; results pending |

## 3. Request security invariants

- Browser code may contain only explicitly approved public `VITE_*` configuration.
- A service-role key, secret key, worker secret, webhook secret, private key, or encryption root key must never be exposed through a browser variable or client response.
- Authentication and CORS are separate. A passing CORS check does not authenticate a request.
- A valid authenticated identity does not imply authorization to another user's rows.
- Every mutation must enforce ownership in the database policy/function as well as validate its input.
- Privileged RPCs must have explicit grants; revoke default PUBLIC/anon/authenticated execution where not intended.
- Security-definer functions require a documented reason, fixed search_path, narrow grants, and explicit identity/authorization checks.
- Never log bearer tokens, cookies, raw API keys, passwords, secret values, or sensitive request bodies.
- Rate limits and replay controls that protect multi-instance services must use shared atomic state, not process-local memory.
- CORS allowlists must be exact serialized origins. Preview origins stay denied by default.

## 4. Authentication and session controls

Use Supabase Auth as the identity provider rather than introducing a second custom password/session system into the Vite application.

- Validate access tokens at trusted Edge Function boundaries with the provider's verified user lookup.
- Keep raw access/refresh tokens out of React state, telemetry, and logs.
- Treat user-editable metadata as untrusted; do not use it for authorization.
- Keep session lifecycle and revocation behavior provider-managed; sensitive server operations must not trust a stale client-side authorization snapshot.
- Add MFA/passkeys through supported provider or maintained WebAuthn libraries only after protocol, recovery, origin, RP-ID, and account-recovery requirements are reviewed.
- Do not implement custom WebAuthn, TOTP, password hashing, or cryptographic protocol primitives in application code when maintained libraries/provider capabilities are available.

## 5. Authorization and database controls

- Every exposed table must have RLS enabled and policies matching the actual ownership/tenant model.
- SELECT policies must constrain rows to the verified subject or an explicit permission relation.
- UPDATE policies require both `USING` and `WITH CHECK` ownership predicates.
- Never rely on `TO authenticated` alone as row authorization.
- Do not use user-editable JWT metadata for privileges.
- Review views for RLS bypass behavior; use security-invoker views where supported or revoke public access.
- Keep cross-owner worker queue claims service-role-only and ensure worker identity is independently verified.
- Test negative cases: user A cannot read, update, delete, claim, or mutate user B's records.

No migration or live RLS policy change is authorized by this work.

## 6. Edge/API controls

- Enforce method, content type, schema, body byte limit, and bounded execution time.
- Reject malformed or oversized JSON before invoking business logic.
- Validate UUIDs, enums, pagination bounds, attempt generations, lease ownership, and idempotency keys at server boundaries.
- Apply rate limits at a shared edge/gateway layer for multi-instance deployments.
- Use exact CORS origin allowlists and return no ACAO header for denied browser origins.
- Never treat a WAF regex match as a substitute for parameterized SQL, output encoding, SSRF-safe egress controls, or server-side validation.

## 7. Cryptography and key management

- Prefer provider-managed TLS and managed encryption-at-rest controls.
- Use a managed KMS/HSM only when the threat model and data classification justify it and an approved free/paid operating model exists.
- Separate key-encryption keys from data-encryption keys; use authenticated encryption and bind ciphertext to stable context with AAD.
- Record key version metadata and retain old decrypt capability until data is rewrapped or retention expires.
- Key rotation must be a tested lifecycle, not just an incremented version counter.
- Never store production master keys in source, browser bundles, ordinary environment files, or logs.
- Do not add a homemade SoftHSM, custom AES envelope service, or custom password storage subsystem to InfiniteX as a substitute for managed platform controls.

## 8. Logging, detection, and incident response

- Emit structured, privacy-minimized events with request/correlation IDs.
- Redact credentials and personal data before events leave the process.
- Track queue overflow and delivery failures; dropped security events must be visible.
- Use durable external retention only after storage, access, retention, and cost are reviewed.
- Preserve incident evidence with hashes and access records; do not claim a local HMAC chain is immutable or equivalent to WORM storage.
- Keep containment actions reversible, scoped, time-limited, and auditable. Do not auto-block users or IPs based on unverified heuristic signals.

## 9. Supply chain and CI gates

The isolated-branch workflow should run:

1. Locked dependency installation.
2. High/critical dependency audit.
3. TypeScript lint/type checks.
4. Full Node regression suite.
5. Edge Function CORS and worker-security tests.
6. Worker-auth boundary tests.
7. Deno type-check of the Phase 103.4 concurrency integration test.
8. CycloneDX dependency SBOM generation.
9. Production build.

CI results must be tied to the exact tested commit SHA. A green unit test does not prove live Supabase policies, deployed secrets, TLS configuration, WAF behavior, or backup restoration.

## 10. Explicitly deferred / not claimed

- Custom Python Argon2/AES-GCM auth server, custom TLS socket server, custom WebAuthn relying party, custom TOTP service, custom KMS/HSM, homemade WAF/IDS/IPS/SIEM.
- Production mTLS between browser and app: browser certificate management is not an appropriate default for a public consumer web application.
- HSTS preload submission, certificate transparency monitoring, OCSP configuration, packet capture, WORM retention, and automated incident containment.
- Live RLS, production secret inventory, live CORS configuration, production deployment headers, penetration test, and restore drill.

These are not implemented or verified merely because a design diagram mentions them.

## 11. Release acceptance

Do not release until:
- Exact-head CI is green.
- All critical/high dependency findings are resolved or explicitly risk-accepted by the owner.
- RLS negative tests prove cross-owner isolation.
- Server-only credentials are absent from browser output and repository history.
- Privileged RPC grants and security-definer functions are reviewed.
- Session, logout, account-switch, and stale-request tests pass.
- Backup integrity and restore are demonstrated in an isolated environment.
- Security findings, exceptions, and residual risks are documented.
- A human explicitly approves release.

**Security posture rule:** report controls as VERIFIED, PARTIAL, BLOCKED, or NOT TESTED. Never describe any system as unbreakable or 100% secure.
