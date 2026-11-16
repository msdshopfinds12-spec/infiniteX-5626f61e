# InfiniteX Cloudflare Billing — Security Plan

**Status:** Threat-control design only; not a security certification
**Runtime:** Not deployed
**Mode:** Mock-only

## 1. Objectives

Protect identity, user billing history, plan prices, entitlement decisions, event authenticity, and financial audit history. Fail closed when identity, state, or event authenticity cannot be established.

## 2. Threats and controls

| Threat | Required control |
|---|---|
| Forged paid status from browser | Ignore client status; server-side state machine only |
| User ID spoofing | Derive subject from verified identity |
| Cross-user data access | Owner-scoped repository methods and negative isolation tests |
| SQL injection | Prepared statements and bound values |
| Forged/replayed webhook | Future raw-body signature verification, freshness checks, unique event ID |
| Amount/currency substitution | Server-side immutable plan-price snapshot |
| Duplicate events/retries | Idempotency keys, unique constraints, atomic transition |
| Secret exposure | Future Worker secret bindings; never source code or Vite client variables |
| CORS abuse | Explicit origin allowlist |
| Resource exhaustion | Body-size caps, bounded pagination, rate limits |
| Information leakage | Generic client errors and redacted structured logs |
| Mock success used in production | No public event injection route; mock adapter isolated |
| Accidental live mode | Fail-closed mode; no provider adapter or secret in this phase |

## 3. Authentication boundary

The frontend auth provider is unverified. Do not invent an integration. Before implementation, inspect login/session code, identify issuer/audience/token format/refresh/logout semantics, then select JWT verification. Verify signature, issuer, audience, expiry, not-before, and allowed algorithm. Derive subject only from verified claims. Cloudflare Access is not assumed to be a customer identity provider.

## 4. Worker security requirements

- Validate method, path, content type, body size, and schema.
- Apply route-specific auth and rate limits.
- Use strict CORS allowlist matching actual frontend origins.
- Set safe response headers and avoid stack-trace leakage.
- Generate request IDs and redact logs.
- Do not store request-scoped mutable state in module globals.
- Use Web Crypto secure randomness for security-sensitive IDs/nonces.
- Use timing-safe comparison for secret/signature comparisons where applicable.
- Keep production secrets out of Git and client bundles.

## 5. Future webhook requirements

No webhook handler or secret is implemented. A future provider integration must verify exact raw body according to current official provider docs before parsing, enforce freshness and merchant/environment checks, deduplicate event IDs, compare checkout reference/amount/currency, and apply changes atomically.

## 6. Fail-closed behavior

- Missing/invalid auth: deny.
- D1 unavailable: safe service error; do not grant entitlements.
- Unknown plan: reject.
- Duplicate event: no repeated side effects.
- Invalid signature or amount mismatch: reject and log redacted security event.
- Internal exception: generic safe error; no fail-open entitlement behavior.

## 7. Audit checklist

- [ ] Auth issuer/audience/signature/expiry tests.
- [ ] Cross-user read isolation tests.
- [ ] Client write denial tests.
- [ ] Prepared-statement review.
- [ ] CORS/CSRF strategy review based on auth mechanism.
- [ ] Rate-limit and body-size tests.
- [ ] D1 uniqueness, transaction rollback, and concurrency tests.
- [ ] Future webhook signature test vectors.
- [ ] Bundle and repository secret scan.
- [ ] Log redaction review.
- [ ] Backup, recovery, retention, and incident-response review.

All checklist items remain NOT TESTED until implementation and evidence exist.
