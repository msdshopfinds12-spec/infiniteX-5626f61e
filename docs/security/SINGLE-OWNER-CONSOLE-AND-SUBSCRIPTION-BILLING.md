# InfiniteX — Single-Owner Console, Customer Access, and Subscription Billing

**Status:** Design candidate for review; not a production security change  
**Scope:** Access control, owner-only administration, customer isolation, and payment-provider readiness  
**Cost posture:** Free-first; payment integrations remain disabled until provider eligibility and approval are confirmed

## 1. Decision: separate owner access from customer access

There are two valid product modes. They must not be mixed:

1. **Private single-user workspace:** only the verified owner can sign in and use any application feature. Public registration is disabled. This mode cannot simultaneously serve paying subscribers.
2. **Subscription SaaS:** customers can access their own customer workspace, while the owner alone can access the private administration console. Customers must never receive owner/admin privileges.

**Recommended for a subscription product:** mode 2. Keep the public customer surface and private owner console as separate authorization boundaries. The owner console can live under a route such as `/owner`, but hiding a route is not security; server-side authorization and database RLS are mandatory.

## 2. Identity and authorization model

### Trusted identity

- Supabase Auth authenticates a user.
- A trusted administrative process assigns the owner claim in JWT `app_metadata`, for example `{ "role": "owner" }`.
- Never read an authorization role from editable `user_metadata`, local storage, URL parameters, form fields, or a browser-controlled profile field.
- Never allow public signup or profile updates to grant the owner role.
- Browser route guards are a user-experience layer only. Every Edge Function and every database operation must enforce authorization independently.

### Owner check for PostgreSQL RLS

A future migration may define a non-public helper similar to:

```sql
create or replace function private.is_workspace_owner()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner',
    false
  );
$$;

revoke all on function private.is_workspace_owner() from public, anon;
grant execute on function private.is_workspace_owner() to authenticated;
```

Use this helper only for owner-only resources. Keep customer-owned data protected by `auth.uid() = user_id`. Do not replace per-customer RLS with a broad owner policy unless the table is explicitly an owner-only administrative resource.

### Current schema observations

- `profiles.role` currently defaults to `user` and is not included in the authenticated user's update grant. Do not use a client-side profile update as an owner provisioning mechanism.
- `subscriptions` and `payments` currently grant authenticated users read-only access to their own rows. Preserve that property.
- The browser workflow read service intentionally does not accept a caller-supplied owner ID; PostgreSQL RLS remains the security boundary.
- The current auth UI contains a sign-up mode. A private-only deployment must disable public signup in the Auth provider configuration and must still reject non-owner identities server-side. Hiding the sign-up button alone is insufficient.

## 3. Payment architecture — provider-neutral until approved

Keep provider-specific code behind an interface. The app must not trust the browser to declare that a subscription is paid.

Suggested server-side contract:

```ts
export type BillingProvider = "paymongo" | "xendit";

export type CreateCheckoutInput = {
  userId: string;          // derived from verified auth, never request JSON
  planCode: "free" | "pro" | "business";
  idempotencyKey: string;
};

export type CheckoutResult =
  | { status: "created"; checkoutUrl: string; providerReference: string }
  | { status: "rejected"; code: "invalid_plan" | "not_eligible" | "provider_unavailable" };

export interface BillingGateway {
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult>;
  verifyWebhook(rawBody: Uint8Array, headers: Headers): Promise<VerifiedBillingEvent>;
}
```

Implementation requirements:

1. Derive the customer ID from the verified Supabase session on the server; ignore any client-supplied `userId`.
2. Allowlist plan codes and load prices/currency from trusted server configuration.
3. Create checkout sessions only on the server. Do not expose secret API keys in `VITE_*` variables or browser bundles.
4. Verify webhook signatures using the provider's documented algorithm against the raw request body.
5. Enforce webhook idempotency with a unique provider event ID and database uniqueness constraints.
6. Update `payments` and `subscriptions` only from verified server-side events or trusted reconciliation jobs.
7. Treat browser redirects as display-only. A success URL is not proof of payment.
8. Handle duplicate, delayed, out-of-order, failed, refunded, canceled, and disputed events.
9. Record provider references and safe audit metadata; never store card numbers, CVVs, wallet PINs, or raw payment credentials.
10. Keep billing disabled until sandbox tests, provider onboarding, policies, privacy/refund terms, and release approval are complete.

## 4. Provider evaluation for Philippine subscriptions

Evaluate at implementation time; do not hard-code provider assumptions:

- PayMongo documents subscription billing for supported cards and Maya, with account configuration required. Its payout documentation describes wallet and bank-account destinations subject to account type and verification.
- Xendit documents subscription billing with recurring payment methods subject to activation/approval. Its published subscription-plan fee and transaction fees must be included in the cost model.
- Stripe's current global availability list does not list the Philippines as a supported country for opening a local Stripe account.

The final provider decision requires a current written confirmation of eligibility, supported methods, payout destination, fees, business-document requirements, and applicable age/representative rules. Do not use another person's identity or bypass any provider checks. If the account holder is below a provider's minimum age, an eligible parent/guardian must handle any permitted financial onboarding in accordance with that provider's terms.

## 5. Free-first development sequence

| Stage | Deliverable | Money movement |
|---|---|---|
| A | Provider-neutral billing types and plan catalogue | None |
| B | Fake billing adapter and synthetic customer accounts | None |
| C | Webhook signature/idempotency tests using fixtures | None |
| D | Provider sandbox integration after eligible account approval | Test mode only |
| E | Non-production end-to-end subscription and cancellation tests | Test mode only |
| F | Production onboarding and payout destination verification | Not started |
| G | Human-approved live billing release | Explicit approval required |

No bank details are required in the InfiniteX source code. Payout bank details belong only in the payment provider's secure onboarding/dashboard flow when the eligible account holder is ready. Never place bank account numbers in GitHub, Supabase browser tables, application logs, or environment variables exposed to the frontend.

## 6. Acceptance tests before enabling paid plans

### Owner-only console
- Anonymous user cannot load owner data or call owner APIs.
- Authenticated customer without the trusted owner claim is denied.
- Customer cannot set or edit their own owner claim.
- User metadata, profile role, URL parameters, local storage, and forged request bodies cannot elevate privileges.
- Owner can access owner resources after server-side claim validation.
- Revoking the owner claim takes effect on refreshed/validated sessions.
- Owner-only Edge Functions reject missing, invalid, expired, and wrong-audience tokens.

### Customer isolation
- Customer A can read only Customer A's rows.
- Customer B can read only Customer B's rows.
- Customer A cannot create, modify, or delete Customer B's rows.
- Customers cannot write payment status, provider event IDs, subscription entitlements, or privileged audit records.
- Service-role credentials never reach the browser.

### Billing integrity
- Invalid webhook signature is rejected.
- Duplicate webhook event is idempotent.
- Delayed/out-of-order events do not restore canceled or refunded access incorrectly.
- Checkout amount, currency, and plan are server-derived.
- Browser success redirect alone never activates a paid entitlement.
- Failed payment, cancellation, refund, and provider outage have explicit tested behavior.

### Release gate
- Run against disposable PostgreSQL and provider sandbox first.
- Run two-user RLS tests using synthetic accounts.
- Verify production schema and provider configuration read-only before any live changes.
- Obtain explicit human approval before migrations, live keys, bank/payout onboarding, billing activation, or deployment.

## 7. Current implementation boundary

This document is a design and acceptance contract. It does **not** claim that owner-only mode, a provider integration, live subscriptions, payouts, or bank-account onboarding is implemented. No production migration, provider account, payment, payout, or deployment is created by this plan.
