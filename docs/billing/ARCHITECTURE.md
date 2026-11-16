# InfiniteX Billing — Provider-Neutral Sandbox Architecture

**Status:** APPROVED FOR OPTION B — backend contract documentation only  
**Branch:** `feat/provider-neutral-billing-sandbox`  
**Payment mode:** MOCK / SANDBOX DESIGN ONLY  
**Runtime status:** NO backend deployed or provisioned  
**Live payments:** DISABLED — no merchant account, provider credentials, live checkout, real charges, or payout configuration

## 1. Executive decision

Option B is approved: define a provider-neutral mock billing domain and backend contracts that can later be hosted by Supabase Edge Functions or Cloudflare Workers. This phase creates documentation only. It does not add application runtime code, database migrations, secrets, cloud resources, or deployments.

The repository currently presents a React/Vite frontend. Its inspected `package.json` has no backend framework, payment SDK, database SDK, or test runner. No production payment processing, subscription persistence, webhook verification, or entitlement enforcement is established.

## 2. How the owner receives subscription money

1. A customer selects a published plan in InfiniteX.
2. In a future approved live system, a trusted server creates a checkout session with an approved payment provider.
3. The customer pays on the provider-hosted checkout page.
4. The provider independently confirms payment to the server through a signed webhook.
5. The server validates signature, amount, currency, merchant account, event freshness, and idempotency.
6. The server records the payment event and updates subscription state.
7. InfiniteX grants entitlements only after verified server-side confirmation.
8. The provider settles eligible net proceeds to the merchant's verified payout account, subject to provider fees, reserves, settlement timing, refunds, disputes, and account eligibility.

**GitHub stores source code; Vercel hosts the app; neither receives customer payments.** Supabase or Cloudflare can host trusted backend logic but is not the payment processor. Payout details belong only in the payment provider's secure merchant dashboard, never in this repository or browser storage.

For any future real merchant onboarding, an eligible adult account owner must handle provider eligibility, identity/business verification, and payout setup. Never bypass age or KYC requirements.

## 3. Scope and non-goals

### Approved in this phase
- Backend API and webhook contracts.
- Logical data model and access-control requirements.
- Runtime mapping for Supabase Edge Functions and Cloudflare Workers.
- Mock-only behavior, state transitions, idempotency rules, and threat model.
- Documentation acceptance checklist.

### Explicitly not approved
- Runtime implementation or dependencies.
- Supabase project changes, Cloudflare resources, database migrations, or data writes.
- Provider account creation, KYC, merchant/payout details, or provider SDKs.
- Live checkout, real card/e-wallet/bank/QR collection, recurring charges, refunds, or payouts.
- Secrets, production webhook endpoints, deployment, merge, or release.

## 4. Proposed architecture

React UI  
  -> typed billing client (public, no provider secrets)  
  -> authenticated backend API boundary (future; not deployed)  
  -> subscription application service  
  -> provider adapter interface (mock only in this phase)  
  -> future hosted checkout + signed provider webhooks  
  -> append-only billing event/ledger records + subscription state  
  -> entitlement authorization check

The frontend is never authoritative for payment success. Browser redirects and client-submitted payment statuses are untrusted hints only. The backend is the sole authority for subscription and entitlement state.

## 5. Domain invariants

- Money is integer minor units with an explicit ISO 4217 currency; no floating-point arithmetic.
- Every ID is opaque and server-generated.
- Every payment/subscription record is scoped to its owner.
- A plan's amount/currency/interval is snapshotted into a checkout attempt.
- Payment events and ledger entries are append-only.
- A provider event ID and internal idempotency key are unique within their defined scope.
- Only a verified server-side payment event may activate paid entitlements.
- Refund/dispute/reversal events must trigger a defined entitlement review/revocation policy; never erase financial history.

## 6. State vocabulary

- Checkout: `created | pending | completed | expired | cancelled | failed`
- Payment: `pending | succeeded | failed | refunded | disputed`
- Subscription: `incomplete | trialing | active | past_due | cancelled | expired`

Transitions must be validated by a domain state machine. Terminal states cannot be silently reopened by a browser request.

## 7. Security invariants

1. No provider secret, service-role key, webhook signing secret, or database admin key in Vite client variables or client bundles.
2. Authenticate user routes and derive user identity from a verified server-side session/token; never trust a caller-supplied user ID.
3. Verify future provider webhooks against the raw request body and official signature procedure.
4. Reject invalid, stale, wrong-merchant, wrong-currency, and amount-mismatched events.
5. Enforce idempotency and atomic event-to-payment/subscription updates.
6. Treat browser redirects/query parameters as untrusted.
7. Grant/revoke entitlements only in trusted server-side code.
8. Apply database row-level security or equivalent owner checks; service credentials remain server-only.
9. Redact secrets and sensitive personal/payment data from logs.
10. Never store PAN, CVV, wallet PIN, bank login, or payout credentials.

## 8. Runtime options — documented, not selected

### Supabase Edge Functions
- Suggested functions: `billing-create-checkout`, `billing-get-subscription`, `billing-cancel-subscription` (future), and `billing-provider-webhook`.
- User-facing functions require verified authentication and derive the subject from the auth context.
- Webhook function is provider-authenticated by signature, not by a user session.
- Any service-role credential is server-only and is not exposed to the browser.
- RLS is required for user-readable billing rows.
- No project configuration, secrets, SQL, or function deployment is included.

### Cloudflare Workers
- Suggested routes: `POST /v1/billing/checkout-sessions`, `GET /v1/billing/subscription`, `POST /v1/billing/subscription/cancel` (future), and `POST /v1/billing/webhooks/{provider}`.
- User routes require verified auth middleware and derive the subject from verified claims.
- Webhook route verifies provider signatures over the raw body before parsing/processing.
- Durable storage/transaction strategy must provide unique event IDs and atomic state changes before any live use.
- No Worker, D1 database, KV namespace, secret, route, or deployment is created.

Both options implement the same domain contract in `API_CONTRACT.md`; do not maintain different business rules per runtime.

## 9. Logical data model

See `DATA_MODEL_CONTRACT.md`. Proposed logical entities: billing_plans, checkout_sessions, payments, subscriptions, subscription_entitlements, billing_events, billing_ledger_entries, and billing_reconciliation_runs. This is documentation, not a migration.

## 10. Provider adapter boundary

The domain depends on an interface, not a provider SDK:
- `createCheckoutSession(input)`
- `verifyWebhook(rawBody, headers)`
- `normalizeWebhookEvent(verifiedEvent)`
- `getPaymentStatus(providerPaymentId)`
- `requestCancellation(providerSubscriptionId)` (future)

The only adapter permitted in a future mock implementation is deterministic and offline. It must not make network calls or simulate real money movement. A real provider adapter requires current official documentation review, eligible adult merchant onboarding, sandbox verification, security review, and separate approval.

## 11. Acceptance and release gates

- **PLAN:** architecture and implementation manifest documented.
- **APPROVE:** explicit approval for Option B received.
- **BUILD:** complete the approved backend contract documentation only.
- **TEST:** documentation consistency review; no runtime tests are implied by docs-only work.
- **AUDIT:** verify trust boundaries, auth, signature, idempotency, ownership, RLS, and secret handling are specified.
- **RELEASE:** not authorized. Separate approval is required for runtime code, dependencies, migrations, cloud provisioning, merge, deployment, credentials, live payments, or production provider activation.
