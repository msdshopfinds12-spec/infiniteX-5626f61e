# InfiniteX Cloudflare Billing — Master Implementation Plan

**Status:** PLAN COMPLETE — documentation scope only
**Selected target:** Cloudflare Workers
**Preferred data store:** D1, subject to later validation
**Branch:** feat/provider-neutral-billing-sandbox
**Mode:** MOCK ONLY
**Provisioning / migrations / deployment / merge:** NOT AUTHORIZED

## 1. Goal

Prepare a secure, maintainable, provider-neutral billing backend using Cloudflare Workers as the API boundary and D1 as the preferred relational storage candidate. This plan does not implement runtime code.

## 2. Planned future structure

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

docs/billing/
  CLOUDFLARE_BACKEND_ARCHITECTURE.md
  CLOUDFLARE_API_IMPLEMENTATION_PLAN.md
  CLOUDFLARE_D1_DATA_CONTRACT.md
  CLOUDFLARE_SECURITY_PLAN.md
  CLOUDFLARE_TEST_PLAN.md
  CLOUDFLARE_COST_AND_LIMITS.md
  CLOUDFLARE_IMPLEMENTATION_PLAN.md
  CLOUDFLARE_AUDIT_REPORT.md

## 3. Future implementation phases (each requires separate approval)

### Phase 0 — Preflight
- Re-inspect repository, auth flow, package versions, and hosting.
- Confirm Cloudflare account access and current free-tier terms without changing account state.
- Check current cf CLI availability and official command syntax.
- Decide auth provider and validate compatibility.
- Confirm D1 suitability and data-retention requirements.

### Phase 1 — Domain core (local only)
- Implement pure TypeScript money, IDs, domain types, state machine, and entitlement policies.
- Implement deterministic mock adapter with no network calls.
- Add unit tests independent of Cloudflare APIs.

### Phase 2 — Worker API (local only)
- Add Worker entrypoint and typed environment contract.
- Add routing, validation, request IDs, CORS allowlist, safe errors, and auth middleware.
- Start with in-memory test repository; no remote binding.

### Phase 3 — D1 adapter (local only, after migration approval)
- Define SQL migration files only after explicit approval.
- Use prepared statements, ownership predicates, uniqueness constraints, and indexed pagination.
- Add isolated local D1 tests and rollback tests.
- No remote migration without separate approval.

### Phase 4 — Security and QA
- Test auth, ownership, client-forgery, idempotency, concurrency, errors, body limits, CORS, and secret boundaries.
- Inspect generated artifacts and repository diff.
- Run existing frontend build/lint and Worker-specific tests.
- Record exact evidence and unresolved issues.

### Phase 5 — Future live-payment readiness (separate project)
Requires eligible adult merchant ownership, provider eligibility/KYC, provider sandbox review, verified payout setup, qualified business/legal review, and separate explicit approval. Signature verification, refunds, disputes, reconciliation, support, and incident response must be tested. No live charges or payouts are included.

## 4. Architecture decisions

| Decision | Current choice | Caveat |
|---|---|---|
| Backend runtime | Cloudflare Workers | User selected |
| Data store | D1 candidate | Confirm consistency and limits |
| Frontend hosting | Keep current host | No migration requested |
| CLI | Cloudflare cf for a future new Worker project | No Wrangler config found; follow current Cloudflare guidance |
| Auth | Unselected | Inspect current InfiniteX auth first |
| Payment provider | None | Mock-only |
| Async processing | Defer Queues | Add only for measured need |
| Cache | No entitlement cache | Avoid stale authorization |
| AI | Not used in billing core | Financial rules remain deterministic |

## 5. Acceptance criteria

- Worker is a thin transport adapter; domain rules are pure and provider-neutral.
- Authentication and ownership are enforced server-side.
- Money uses integer minor units.
- Client status and redirects cannot activate subscriptions.
- Mock adapter makes no external calls.
- D1 writes are parameterized, constrained, owner-scoped, and transaction-safe.
- Duplicate event handling is idempotent.
- Logs redact credentials and personal/payment data.
- Tests prove allowed and denied behavior.
- No deployment or paid resource is needed for local implementation.

## 6. Scope boundary

This plan authorizes documentation only. It does not authorize Worker source files, dependency installation, D1 schema/migrations, bindings, cloud provisioning, secrets, merge, or deployment. Separate approval is required before each such step.
