# Billing Implementation Manifest

**Status:** OPTION B APPROVED — documentation-only backend contract build  
**Branch:** `feat/provider-neutral-billing-sandbox`  
**Execution mode:** mock-only design; no external payment calls

## Approval record

The user explicitly approved Option B for this branch. The approved scope is provider-neutral mock domain and documented Supabase Edge Functions / Cloudflare Worker contracts. This is not approval to provision infrastructure, write migrations, add secrets, deploy, merge, or collect real payments.

## Baseline evidence

- Repository: `msdshopfinds12-spec/infiniteX-5626f61e`
- Default branch: `main`
- Frontend: React 18 + Vite + TypeScript
- Existing scripts: `dev`, `build`, `preview`, `lint`
- Payment provider SDK: not found in inspected `package.json`
- Backend/database SDK: not found in inspected `package.json`
- Test runner/script: not found in inspected `package.json`
- Existing billing runtime implementation: not found by prior repository code search
- Build/test execution: NOT RUN

## Approved deliverables

| File | Responsibility | State |
|---|---|---|
| `docs/billing/ARCHITECTURE.md` | System architecture, invariants, runtime options | Approved / update |
| `docs/billing/IMPLEMENTATION_MANIFEST.md` | Scope and acceptance gates | Approved / update |
| `docs/billing/API_CONTRACT.md` | HTTP request/response, auth, errors, webhook contract | Build |
| `docs/billing/DATA_MODEL_CONTRACT.md` | Logical entities, keys, ownership, indexes, retention | Build |
| `docs/billing/SECURITY_THREAT_MODEL.md` | Threats, mitigations, abuse cases, audit checklist | Build |

## Runtime mapping

The same business contract can be hosted by either:
- Supabase Edge Functions, using verified auth context and RLS; or
- Cloudflare Workers, using verified auth middleware and transactional storage.

No runtime has been selected or provisioned. No functions, Workers, D1, Supabase tables, policies, or secrets are created in this phase.

## Build sequence

1. Finalize provider-neutral API and webhook contracts.
2. Define logical data entities and transactional invariants without writing SQL migrations.
3. Document Supabase Edge Functions and Cloudflare Worker route mapping.
4. Document security threats, abuse cases, and review checklist.
5. Cross-check consistency against the architecture and scope.
6. Record that runtime build, build/lint commands, integration tests, and deployment were not performed.

## Hard prohibitions

- No live payment gateway integration or network calls.
- No real merchant, payout, bank, card, wallet, or identity details in GitHub.
- No production webhook endpoint or signing secret.
- No database migrations, data writes, cloud provisioning, deployment, merge, or release.
- No new dependencies or package/lockfile changes.
- No claiming tests/build passed unless actual command output proves it.

## Acceptance criteria

- All endpoint contracts identify authentication and trust boundary.
- Browser redirect never proves payment.
- Webhook processing requires signature verification in any future live implementation.
- Amount/currency/merchant mismatch is rejected.
- Duplicate events are idempotent and financial history is append-only.
- User ownership is derived from verified identity, not request body.
- Entitlement changes are server-side only.
- Both runtime mappings implement identical domain rules.
- Mock behavior is explicitly non-production and no-money.
