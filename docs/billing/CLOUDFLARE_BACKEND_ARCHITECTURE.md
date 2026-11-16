# InfiniteX — Cloudflare Backend Architecture

**Status:** PLAN APPROVED — documentation only
**Target:** Cloudflare Workers; D1 is the preferred relational storage candidate
**Mode:** MOCK DESIGN ONLY
**Runtime:** NOT IMPLEMENTED / NOT PROVISIONED
**Live payments:** DISABLED

## 1. Decision

Cloudflare Workers is the selected backend target. D1 is the preferred relational persistence candidate because billing records require relational ownership, uniqueness, lifecycle, and audit-history constraints. This is a design decision, not evidence that a Cloudflare account, Worker, or D1 database exists.

The existing React/Vite frontend stays on its current hosting path. This plan does not migrate Vercel hosting or change the frontend.

## 2. Architecture

React + Vite frontend (existing host; unchanged)
  -> HTTPS + verified user session
  -> Cloudflare Worker API (/v1/billing/*)
     - request ID, CORS, rate-limit policy
     - schema validation
     - provider-neutral authentication middleware
     - route handlers
  -> Billing application services
     - plan catalog
     - mock checkout-session service
     - subscription query service
     - entitlement policy
     - future verified payment-event processor
  -> Provider adapter interface (mock adapter only; deterministic and offline)
  -> D1 candidate (not created)
     - plans, checkout sessions, payments
     - subscriptions, entitlements
     - append-only events and ledger

The Worker is the trusted server boundary. The browser is never authoritative for payment status or entitlements. D1 is the proposed persisted source of truth. A future provider webhook is a separate ingress trust boundary and must be verified before any state transition.

## 3. Product selection

| Product | Decision | Reason |
|---|---|---|
| Workers | Selected | HTTPS API and server-side trust boundary |
| D1 | Preferred candidate | Relational billing records and constraints |
| Workers Secrets | Future only | Server-side auth/provider secrets |
| Queues | Defer | Add only for a measured asynchronous workload |
| KV | Not a financial source of truth | Not suitable for ledger/entitlement consistency |
| Durable Objects | Defer | No current coordination requirement |
| Workers AI | Not needed | Payment correctness must remain deterministic |
| R2 | Not needed | No billing file-storage requirement |

No Cloudflare product is provisioned in this phase.

## 4. Repository and CLI strategy

The inspected branch tree contained no Wrangler configuration or Worker source. Cloudflare's installed project guidance says to use the cf CLI for a new project with no Cloudflare configuration, and not to add Wrangler configuration or install Wrangler by default. A future implementation must inspect current CLI availability and official command syntax first. This phase runs no CLI commands and creates no configuration.

## 5. Proposed future source layout (not created)

workers/billing-api/
  src/
    index.ts
    env.ts
    router/
    middleware/
    billing/
      domain/
      application/
      ports/
      adapters/d1/
      adapters/mock/
      validation/
    observability/
  test/
    unit/
    integration/
    security/

The domain layer must not import Cloudflare APIs. D1 and Worker bindings belong in infrastructure adapters. This keeps business rules deterministic and testable.

## 6. Reliability and consistency

- Use D1 prepared statements with bound parameters for untrusted values.
- Enforce unique event IDs, idempotency keys, and provider references with database constraints.
- Group related state changes in a transaction-safe D1 batch/transaction pattern and test rollback behavior.
- Never split a logically atomic payment transition across independent requests.
- Use deterministic pagination and indexes based on query-plan review.
- Do not cache subscription or entitlement authorization decisions in KV.
- Retry only operations proven idempotent.

## 7. Security invariants

- Verify authentication server-side; never trust client-supplied user IDs.
- No secrets in Vite client variables, Git history, fixtures, or logs.
- No client writes to payments, subscriptions, entitlements, billing events, or ledger entries.
- Browser success redirects cannot activate access.
- No public mock event-injection route.
- Future webhook verification uses raw bytes and current official provider guidance.
- Every repository method enforces owner scope.
- Use bounded request bodies, rate limits, generic errors, and redacted structured logs.

## 8. Open decisions before runtime implementation

- Authentication issuer/provider and token-verification strategy.
- D1 suitability after account/plan/cost review.
- Cancellation, refund, dispute, and entitlement policy.
- Whether asynchronous Queue processing is actually required.
- Data retention, privacy, support, and business operations.
- Any live provider and merchant onboarding are separate future decisions.

## 9. Non-goals

No Worker, D1 database, binding, secret, route, custom domain, queue, migration, provider SDK, live checkout, deployment, or production configuration is created by this document.
