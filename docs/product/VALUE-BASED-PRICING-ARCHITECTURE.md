# InfiniteX Value-Based Pricing Architecture

**Status:** PROPOSAL — documentation only; not a live pricing or billing configuration  
**Target branch:** `engineering/infinitex-canonical-integration-candidate`  
**Decision owner:** Human product owner  
**Currency:** PHP for eventual customer-facing price research; no price is approved by this document.

## 1. Product and pricing principles

InfiniteX pricing must reflect measurable customer outcomes and sustainable service delivery, not an arbitrary percentage increase or an unverified feature list.

Non-negotiable principles:

- Do not invent the current Enterprise price, customer savings, conversion rate, usage, or willingness to pay.
- Do not charge for capabilities that are not implemented, measurable, and available to the relevant customer.
- Keep demo/sample data outside billable usage.
- Publish limits, overage behavior, billing interval, taxes, cancellation, and support scope before checkout.
- Keep billing-provider secrets and privileged operations server-side.
- Never treat client-side tier labels or feature flags as authorization.
- Preserve Free access where feasible; do not make a tier depend on a paid AI provider unless its costs are explicitly funded.

## 2. Proposed packaging

These are product hypotheses, not verified existing features or active plans.

| Package | Intended customer | Value proposition | Candidate entitlements |
|---|---|---|---|
| Free | Individual evaluator | Learn and validate fit | Basic workspace, limited projects, sample/demo experience |
| Pro | Independent builder or small team | Reduce repetitive operational work | Higher workspace limits, verified automation allowance, usage history, standard support |
| Enterprise | Organization | Govern teams and critical workflows | Organization controls, role administration, audit exports, negotiated capacity, agreed support commitments |

A feature becomes a sellable entitlement only after its backend enforcement, tests, operational owner, and customer-facing documentation exist.

## 3. Value model

Estimate customer value from evidence:

`MonthlyCustomerValue = VerifiedHoursSaved × CustomerHourlyCost + VerifiedAvoidedCosts`

Use only measured, customer-approved inputs. Avoid counting the same benefit twice.

A candidate price ceiling can be tested as:

`ValueBasedCeiling = MonthlyCustomerValue × ValueCaptureRate`

The value-capture rate is a research variable, not a universal constant. Test willingness to pay with interviews, pilot offers, and observed renewals. Never assume the customer will realize the full theoretical savings.

Sustainable price floor:

`PriceFloor = (VariableServiceCost + AllocatedSupportCost + PaymentCost) / (1 - TargetContributionMargin)`

All inputs must be measured over a representative period. Include model inference, storage, compute, email, observability, support, refunds, taxes where applicable, and payment processing.

Final tested price must satisfy both customer value and sustainable delivery economics. If the value ceiling is below the cost floor, redesign the feature or service; do not hide the deficit with unbounded usage.

## 4. Recommended value metric

Start with one auditable primary metric per product capability. Prefer a metric directly correlated with delivered customer value and hard to manipulate.

Candidates to validate:

- Successfully completed, customer-authorized workflow runs.
- Active managed seats for organization-level administration.
- Connected workspaces where each connection delivers a distinct operational benefit.

Do not bill on raw clicks, failed runs, retries, internal system jobs, sample data, or unverified token estimates.

For any usage meter, define:
- canonical event name and version;
- authenticated tenant and actor;
- server-generated event ID;
- idempotency key;
- successful terminal state;
- billable unit and unit multiplier;
- event timestamp and billing period;
- correction/reversal process;
- retention and audit policy.

## 5. Entitlement architecture

Suggested logical model (not a migration):

- `plans`: stable plan identifiers and public display metadata.
- `plan_versions`: immutable versioned commercial definitions with effective dates.
- `entitlements`: capability key, limit, unit, and enforcement mode.
- `subscriptions`: tenant, plan version, status, billing period, provider reference.
- `usage_events`: append-only server-originated usage facts.
- `usage_adjustments`: auditable corrections with actor and reason.
- `entitlement_decisions`: optional decision audit record; never a replacement for source-of-truth checks.

Use integer minor currency units (for PHP, centavos) for money. Avoid floating-point arithmetic for charges. Use UTC timestamps and explicit billing-period boundaries.

## 6. Trusted enforcement flow

1. Authenticate the user and resolve tenant membership on the server.
2. Validate requested operation and tenant ownership.
3. Load the effective subscription and immutable plan version.
4. Check entitlement and quota in a transaction or atomic server-side operation.
5. Apply an idempotency key to prevent duplicate charges or usage events.
6. Execute the authorized operation.
7. Record billable usage only after the defined successful terminal state.
8. Reconcile usage against provider invoices and expose an auditable customer summary.

Fail closed for unknown plan versions, missing tenant membership, invalid subscription state, stale entitlement cache beyond its allowed TTL, or malformed usage events.

## 7. Billing provider boundary

Keep the domain model provider-neutral. A future adapter may integrate a billing provider, but no provider is selected here.

Webhook requirements before activation:
- verify signature against the raw request body;
- reject stale/replayed events where supported;
- persist provider event ID with a unique constraint;
- process asynchronously and idempotently;
- tolerate out-of-order delivery;
- reconcile subscription state periodically;
- never trust browser redirect success as proof of payment.

No checkout, price object, invoice, customer, payment method, webhook, or live subscription is created or changed by this proposal.

## 8. Pricing research and launch gates

Before publishing prices:

1. Interview representative users about current workflow, alternatives, measurable pain, and budget authority.
2. Run a time-bounded pilot with clearly disclosed limits.
3. Measure activation, successful outcomes, support burden, retention, and actual variable cost.
4. Compare value ceiling with sustainable price floor.
5. Test a small number of clearly documented price/packaging options.
6. Review consumer disclosures, tax treatment, refunds, cancellation, privacy, and local legal requirements.
7. Obtain human approval of exact prices and billing interval.
8. Implement provider integration in a separate reviewed change.
9. Run sandbox tests for checkout, webhook replay, cancellation, renewal, failed payment, refunds, and tenant isolation.
10. Obtain separate production billing approval.

## 9. Security and test requirements

- Tenant isolation enforced by database RLS and trusted server authorization.
- No service-role or billing secret in browser code or `VITE_*` variables.
- No client-supplied plan, owner, price, usage amount, subscription status, or payment status is trusted.
- No negative or duplicate usage can be applied.
- Concurrent quota consumption must be atomic.
- Subscription downgrade/expiry must not silently grant premium capabilities.
- Audit logs must exclude credentials, payment secrets, and unnecessary personal data.

Required tests: unauthenticated access, cross-tenant access, forged plan, forged usage, duplicate event, replayed webhook, out-of-order webhook, concurrent quota boundary, cancellation, renewal, downgrade, expired subscription, and provider outage.

## 10. Current evidence and blockers

**Verified from the inspected candidate source:** authentication/session foundation and explicit demo-mode UI exist. The candidate dashboard itself states that live backend, agent runtime, pipeline, log stream, and security scan are not connected or verified.

**Not verified:** production usage metering, plan catalog, entitlement enforcement, billing provider, checkout, invoice reconciliation, customer value measurements, current Enterprise price, and willingness to pay.

**Therefore:** no numerical price recommendation is approved. The earlier suggested 15% Enterprise increase is superseded by this evidence-led process.

## 11. Approval boundaries

This document does not authorize:
- production schema changes or migrations;
- billing provider connection or configuration;
- customer charges or subscription changes;
- public pricing publication;
- plan entitlement changes in production;
- merge, deployment, or release.

**Exit criterion:** a documented, measured price and packaging decision approved by the product owner, followed by a separately reviewed implementation and sandbox verification.
