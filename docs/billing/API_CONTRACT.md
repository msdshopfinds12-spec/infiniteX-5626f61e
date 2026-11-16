# InfiniteX Billing API Contract

**Status:** DESIGN CONTRACT ONLY — no endpoints are deployed  
**Mode:** MOCK specification; no real payment operations  
**Version:** `v1`

This contract is runtime-neutral. Supabase Edge Functions and Cloudflare Workers must implement the same semantics. The examples use synthetic identifiers and amounts only.

## 1. Global rules

- Base path: `/v1/billing` (Cloudflare route mapping); Supabase may expose one function per operation while preserving the same JSON schemas.
- Content type: `application/json` except the future provider webhook raw-body endpoint.
- All timestamps: RFC 3339 UTC.
- Money: integer minor units plus ISO 4217 currency, e.g. `{"amountMinor":19900,"currency":"PHP"}`.
- IDs: opaque server-generated strings.
- User identity: derived from verified auth context. Never accept `userId` as authority from the request body.
- All responses include `requestId`; never return provider secrets or sensitive raw payloads.
- Client must treat every payment status as untrusted until retrieved from the authenticated backend.

## 2. Create checkout session

**Route:** `POST /v1/billing/checkout-sessions`  
**Supabase mapping:** `billing-create-checkout`  
**Auth:** required user session  
**Idempotency:** required `Idempotency-Key` header; scoped to authenticated subject and operation

Request:
```json
{
  "planId": "plan_demo_monthly",
  "returnUrl": "https://example.invalid/billing/return"
}
```

Rules:
- Resolve plan and price on the server; ignore client-supplied amount/currency.
- Validate plan is published and available.
- Create a synthetic mock session only in mock mode.
- The mock response must not link to a real provider or imply money was transferred.

Response (mock):
```json
{
  "requestId": "req_demo_001",
  "mode": "MOCK",
  "checkoutSession": {
    "id": "cs_demo_001",
    "status": "pending",
    "planId": "plan_demo_monthly",
    "amountMinor": 19900,
    "currency": "PHP",
    "expiresAt": "2030-01-01T00:15:00Z"
  },
  "notice": "DEMO ONLY — NOT A REAL PAYMENT"
}
```

## 3. Get current subscription

**Route:** `GET /v1/billing/subscription`  
**Supabase mapping:** `billing-get-subscription`  
**Auth:** required user session

Rules:
- Return only the subscription belonging to the verified subject.
- Return a stable empty state when no subscription exists.
- Never reveal another user's records or provider metadata.

Response:
```json
{
  "requestId": "req_demo_002",
  "subscription": null
}
```

## 4. Get billing history

**Route:** `GET /v1/billing/payments?cursor={opaque}&limit=20`  
**Supabase mapping:** optional `billing-list-payments`  
**Auth:** required user session

Rules:
- Clamp limit to a documented maximum (for example 50).
- Scope query by verified subject on the server and enforce RLS/storage ownership.
- Return a cursor, not an arbitrary database offset, for pagination.
- Exclude raw webhook bodies, credentials, and unnecessary personal data.

## 5. Cancel subscription (future contract only)

**Route:** `POST /v1/billing/subscription/cancel`  
**Supabase mapping:** `billing-cancel-subscription`  
**Auth:** required user session  
**Availability:** not implemented in this mock documentation phase

Request:
```json
{"timing":"period_end"}
```

A future implementation must define cancellation semantics from the verified subscription state and provider capability. It must not claim a provider cancellation succeeded until the trusted backend confirms it. No cancellation endpoint is currently deployed.

## 6. Provider webhook boundary (future live integration only)

**Route:** `POST /v1/billing/webhooks/{provider}`  
**Supabase mapping:** `billing-provider-webhook`  
**Auth:** provider signature verification; not user-cookie authentication

Required processing order:
1. Read the exact raw request bytes and required signature headers.
2. Enforce request size and timestamp/freshness limits.
3. Verify signature using the provider's official algorithm and server-only secret.
4. Parse only after successful verification.
5. Validate merchant/account reference, event type, payment reference, amount, currency, and environment.
6. Insert provider event under a unique provider-event key.
7. Apply payment/subscription/ledger transition atomically.
8. Return success only after durable processing or safe idempotent acknowledgement.

A browser redirect is not a webhook. No webhook route, provider secret, or live verifier is created by this contract.

## 7. Mock event injection

There is deliberately **no public mock event injection endpoint**. Tests should call an in-process fake provider/service directly. Do not expose an unauthenticated route that lets a browser mark its own payment paid. Any future developer-only simulator must be disabled in production builds and guarded by an isolated test environment.

## 8. Error envelope

```json
{
  "requestId": "req_demo_error",
  "error": {
    "code": "PAYMENT_EVENT_INVALID",
    "message": "The billing event could not be accepted."
  }
}
```

Stable error codes:
- `AUTH_REQUIRED` — missing/invalid authentication
- `PLAN_UNAVAILABLE` — unknown or unpublished plan
- `IDEMPOTENCY_CONFLICT` — same key reused with a different request fingerprint
- `CHECKOUT_NOT_FOUND` — checkout does not exist or is not visible to this user
- `INVALID_STATE_TRANSITION` — requested transition is not allowed
- `PAYMENT_EVENT_INVALID` — invalid event/signature/schema
- `PAYMENT_AMOUNT_MISMATCH` — amount or currency does not match server-side checkout
- `PAYMENT_EVENT_DUPLICATE` — already processed; safe duplicate acknowledgement may be returned internally
- `RATE_LIMITED` — request throttled
- `INTERNAL_ERROR` — generic response; sensitive internals omitted

## 9. Status authority

| Input/source | Trusted to activate entitlement? |
|---|---|
| Frontend success page / query string | No |
| Client-submitted `status: "paid"` | No |
| Mock in-process fixture in tests | Test environment only |
| Verified provider webhook + server validation | Future live design only |
| Admin UI toggle | No, unless a separately audited controlled workflow is approved |

## 10. Runtime mapping

| Operation | Supabase Edge Function | Cloudflare Worker |
|---|---|---|
| Create checkout | `billing-create-checkout` | `POST /v1/billing/checkout-sessions` |
| Read subscription | `billing-get-subscription` | `GET /v1/billing/subscription` |
| List payments | `billing-list-payments` | `GET /v1/billing/payments` |
| Cancel (future) | `billing-cancel-subscription` | `POST /v1/billing/subscription/cancel` |
| Provider webhook (future) | `billing-provider-webhook` | `POST /v1/billing/webhooks/{provider}` |

