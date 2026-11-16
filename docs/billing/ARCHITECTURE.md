# InfiniteX Billing — Provider-Neutral Sandbox Architecture

**Status:** PLAN ONLY — implementation not yet approved  
**Branch:** feat/provider-neutral-billing-sandbox  
**Target:** React + Vite + TypeScript frontend currently in this repository  
**Payment mode:** MOCK / SANDBOX ONLY  
**Live payments:** DISABLED — no merchant account, provider credentials, live checkout, real charges, or payout configuration

## 1. Executive decision

Build a provider-neutral billing boundary first. The application must not depend directly on PayMongo, Xendit, Maya, or another gateway. A future provider adapter may be selected only after an eligible adult merchant account owner completes provider eligibility, identity verification, business review, and payout-account setup.

This repository currently presents a React/Vite UI. The inspected package.json has no backend framework, payment SDK, database SDK, or test runner. Therefore this plan does not claim that payment processing, subscription persistence, webhook verification, or entitlement enforcement already exists.

## 2. How the owner receives subscription money

1. A customer selects a published plan in InfiniteX.
2. The server creates a checkout session with an approved payment provider.
3. The customer pays on the provider-hosted checkout page.
4. The provider independently confirms the payment to the server through a signed webhook.
5. The server validates the signature, amount, currency, merchant account, event freshness, and idempotency key.
6. The server records the immutable payment event and updates the subscription state.
7. InfiniteX grants entitlements only after verified server-side confirmation.
8. The provider settles eligible net proceeds to the merchant's verified payout account, subject to provider fees, reserves, settlement timing, refunds, disputes, and account eligibility.

**Important:** GitHub stores source code; Vercel hosts the app; neither receives customer payments. Supabase is a possible future database/backend option, not a payment processor. Payout details belong only in the payment provider's secure merchant dashboard, never in this repository or browser storage.

## 3. Scope and non-goals

### In scope for the first implementation
- Explicit mock payment provider with deterministic fixtures.
- Typed plan, checkout, payment, subscription, entitlement, and ledger domain models.
- Billing status UI that clearly labels every record as DEMO.
- Server-contract interfaces and webhook verification design.
- Unit tests for state transitions, duplicate events, invalid signatures, amount mismatch, and failed/cancelled payments.
- Documentation for eventual provider selection and deployment gates.

### Out of scope
- Live provider account creation or KYC.
- Real card, e-wallet, bank, or QR payment collection.
- Real payout or withdrawal operations.
- Production webhook endpoint or secrets.
- Real customer billing, automatic renewal, refund execution, or tax/legal advice.
- Storing card numbers, CVV, bank credentials, wallet PINs, or payout account credentials.

## 4. Proposed architecture

React UI (plan picker / billing status / demo history)
  -> Typed Billing Client (no provider secrets)
  -> Server API boundary (NOT PRESENT YET; future approved runtime)
  -> Subscription Service
  -> Payment Provider Adapter (mock first; real provider only later)
  -> Hosted Checkout + Signed Webhooks (future provider integration)
  -> Append-only Billing Ledger + Subscription Store
  -> Reconciliation / Admin Reporting
  -> Provider settlement to verified merchant payout account

The frontend must never decide that a payment succeeded. It may display a pending state while awaiting server confirmation. The server is the sole authority for payment and entitlement state.

## 5. Domain model

- **Plan:** immutable plan identifier, display name, amount in minor currency units, currency, billing interval, active flag, and version.
- **CheckoutSession:** opaque internal ID, user ID, plan ID, provider session reference, status, expiry, and creation timestamp. Never contains payment credentials.
- **Payment:** internal ID, checkout ID, provider payment reference, amount, currency, status, paid timestamp, and provider metadata allowlist.
- **Subscription:** internal ID, user ID, plan ID, status, period start/end, cancellation-at-period-end flag, and provider subscription reference.
- **Entitlement:** user ID, feature key, effective start/end, and source subscription ID.
- **BillingEvent:** append-only event ID, provider event ID, event type, received timestamp, verified flag, payload digest, and processing outcome. Do not store unnecessary raw personal or payment data.
- **LedgerEntry:** append-only debit/credit record with currency, amount in minor units, source event, and idempotency key. Never silently overwrite financial history.

Suggested statuses:
- Checkout: created | pending | completed | expired | cancelled | failed
- Payment: pending | succeeded | failed | refunded | disputed
- Subscription: incomplete | trialing | active | past_due | cancelled | expired

All money values use integer minor units (for PHP, centavos) and explicit ISO currency codes. Never use floating-point arithmetic for money.

## 6. Security invariants

1. No provider secret, service-role key, webhook signing secret, or database admin key in Vite client variables or client bundles.
2. Verify webhook signatures against the raw request body using the provider's official verification procedure.
3. Reject unsigned, invalid, stale, wrong-merchant, wrong-currency, and amount-mismatched events.
4. Enforce idempotency with a unique provider event ID and a transaction-safe state update.
5. Treat browser redirect/query parameters as untrusted display hints, never proof of payment.
6. Grant or revoke entitlements only in trusted server-side code.
7. Apply authenticated ownership checks and database row-level security to user billing records.
8. Keep a minimal audit trail; redact secrets and sensitive personal/payment data from logs.
9. Use least-privilege service credentials and rotate compromised secrets.
10. Never expose a manual admin action that can mark a real payment as paid without verified provider evidence.

## 7. Proposed future data tables

- billing_plans
- checkout_sessions
- payments
- subscriptions
- subscription_entitlements
- billing_events (append-only, unique provider event ID)
- billing_ledger_entries (append-only, unique idempotency key)
- billing_reconciliation_runs

Schema migrations are not part of this plan-only commit. Before implementation, select and approve the backend runtime and database. Every user-owned row must have explicit ownership policies; service-role access must remain server-only.

## 8. Provider adapter contract

The domain layer should depend on an interface, not a provider SDK:

- createCheckoutSession(input)
- verifyWebhook(rawBody, headers)
- normalizeWebhookEvent(verifiedEvent)
- getPaymentStatus(providerPaymentId)
- requestCancellation(providerSubscriptionId) (future, not implemented in mock scope)

The first adapter is MockPaymentProvider. It must use clearly synthetic test fixtures and must not make network calls or simulate real money movement. A future PayMongo or Xendit adapter requires official current documentation review, merchant eligibility confirmation by the adult account owner, sandbox credentials, and separate approval.

## 9. Repository implementation manifest (proposed)

| Path | Purpose | Initial mode |
|---|---|---|
| docs/billing/ARCHITECTURE.md | This architecture and security contract | Plan |
| docs/billing/IMPLEMENTATION_MANIFEST.md | File-by-file implementation and acceptance gates | Plan |
| src/billing/domain/types.ts | Typed domain contracts | Build after approval |
| src/billing/domain/state-machine.ts | Pure, deterministic status transitions | Build after approval |
| src/billing/providers/mock-provider.ts | Synthetic mock provider only | Build after approval |
| src/billing/services/billing-service.ts | Mock orchestration and idempotency boundary | Build after approval |
| src/billing/demo/fixtures.ts | Clearly labelled synthetic plans/events | Build after approval |
| src/components/billing/BillingPanel.tsx | Demo billing UI | Build after approval |
| src/billing/index.ts | Public module exports | Build after approval |
| tests/billing/*.test.ts | State/security regression tests | Build after approval |
| docs/billing/PROVIDER_ONBOARDING_GATE.md | Adult-owned provider and payout readiness checklist | Build after approval |

No existing files are planned for deletion or replacement.

## 10. Test and acceptance plan

- Valid mock payment transitions pending checkout to paid and active subscription.
- A duplicate event does not create a second payment or ledger entry.
- Invalid signature never changes payment or entitlement state.
- Wrong amount or currency is rejected.
- Browser-only success redirect never activates a subscription.
- Failed, cancelled, expired, refunded, and disputed events do not grant active entitlements.
- A user cannot read another user's billing records.
- No secret or real payment credential appears in source, client bundle, logs, or fixtures.
- UI labels all fixture transactions as DEMO / NOT REAL MONEY.
- Run the repository's actual available checks after implementation. At planning time, package.json exposes npm run build and npm run lint; no test script or test runner is currently declared.

## 11. Approval gates

- **PLAN:** architecture and manifest committed on this feature branch.
- **APPROVE:** human approval required before source implementation and dependency changes.
- **BUILD:** implement mock-only billing module and UI.
- **TEST:** run and record actual build/lint/test output; fix failures.
- **AUDIT:** inspect auth boundaries, secrets, idempotency, event verification, RLS design, and UI demo labeling.
- **RELEASE:** separate human approval required before merge, deployment, live credentials, real charges, database migrations, or production provider activation.

## 12. Decision still required

Before implementation, confirm the backend target for trusted billing operations:
- Keep this as a frontend-only mock prototype for now; or
- Design the future server boundary for an approved backend (Supabase Edge Functions or Cloudflare Workers) without deploying it.

Until then, the implementation must remain mock-only and must not collect real payments.
