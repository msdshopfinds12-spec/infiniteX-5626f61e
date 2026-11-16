# InfiniteX Cloudflare Billing API — Implementation Plan

**Status:** PLAN ONLY — no runtime code authorized
**Target:** Cloudflare Worker API + D1 candidate
**Mode:** MOCK ONLY; no external payment calls

## 1. Proposed API surface

All routes are contracts, not deployed endpoints.

| Method | Route | Auth | Scope |
|---|---|---|---|
| GET | /health | None | Minimal health status; no binding or secret details |
| GET | /v1/billing/plans | Public | Published plan metadata only |
| POST | /v1/billing/checkout-sessions | Required | Create a mock checkout session |
| GET | /v1/billing/subscription | Required | Current user's subscription only |
| GET | /v1/billing/payments | Required | Current user's paginated history |
| POST | /v1/billing/subscription/cancel | Required | Reserved future contract; not implemented |
| POST | /v1/billing/webhooks/{provider} | Provider signature | Future live-only contract; absent in mock phase |

## 2. Request and response rules

- Every JSON response includes a server-generated requestId.
- Timestamps use RFC 3339 UTC.
- Amounts are integer minor units plus explicit ISO currency.
- IDs are opaque and server-generated.
- Use strict request schemas, reject unknown fields where appropriate, cap body size, and validate content type.
- Use stable error codes; never return stack traces, secrets, SQL, or raw provider payloads.
- CORS allowlist contains only approved InfiniteX frontend origins; no wildcard with credentials.
- Use bounded page size and opaque cursors.

## 3. Checkout contract

The request may contain planId and an optional validated return path. Do not accept amount, currency, status, user ID, or provider account as authority from the browser.

Worker behavior:
1. Authenticate the request.
2. Derive subject from verified identity.
3. Load published plan and price from server-side catalog.
4. Create a mock session using a server-generated ID and price snapshot.
5. Persist only after a later phase separately authorizes D1 and migrations.
6. Return mode MOCK and the label DEMO — NOT A REAL PAYMENT.
7. Never return a real provider checkout URL or claim a charge occurred.

## 4. Authentication contract

The auth provider is intentionally unselected. Future middleware must verify signature, issuer, audience, expiry, not-before, and permitted algorithm using trusted issuer/JWKS configuration. Never accept an arbitrary JWKS URL from a request. Derive the subject only from verified claims. Do not log bearer tokens or session cookies.

Do not assume Cloudflare Access is the correct consumer identity provider. Inspect the current InfiniteX sign-in flow before selecting auth.

## 5. Webhook contract — future only

No webhook handler is part of the mock API and none is deployed. A later live implementation must read raw bytes, verify signature and timestamp against current provider documentation, validate provider account/environment/event/payment reference/amount/currency, deduplicate provider event IDs, and apply a legal transition atomically.

## 6. Error model

Stable codes: AUTH_REQUIRED, AUTH_INVALID, PLAN_UNAVAILABLE, VALIDATION_ERROR, IDEMPOTENCY_CONFLICT, RESOURCE_NOT_FOUND, INVALID_STATE_TRANSITION, RATE_LIMITED, INTERNAL_ERROR.

Errors must be generic and must not expose stack traces or sensitive internals.

## 7. Implementation order

1. Re-inspect frontend authentication and routing; record evidence.
2. Confirm current Cloudflare cf CLI workflow.
3. Implement framework-free domain types and pure state machine.
4. Implement route parsing, validation, request IDs, and error envelope.
5. Add verified-auth adapter only after identity provider selection.
6. Add repository port and in-memory test adapter.
7. Add offline mock provider adapter.
8. Add D1 adapter only after D1 selection and migration approval.
9. Add owner-scoped reads and server-side entitlement policy.
10. Add integration/security tests and record exact outputs.

## 8. Definition of done

- Client-supplied user ID or paid status cannot grant access.
- Mock checkout is deterministic and clearly labelled.
- Mock tests make no external calls.
- Invalid input/auth is rejected safely.
- User A cannot read User B's records.
- Duplicate event processing is idempotent in the test adapter.
- No secrets/payment credentials appear in source or frontend bundle.
- No persistence is claimed until an approved D1 implementation exists.
