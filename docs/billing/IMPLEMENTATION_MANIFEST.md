# Billing Implementation Manifest

**Status:** PLAN ONLY — awaiting explicit implementation approval  
**Branch:** feat/provider-neutral-billing-sandbox  
**Execution mode:** mock-only; no external payment calls

## Baseline evidence

- Repository: msdshopfinds12-spec/infiniteX-5626f61e
- Default branch at inspection: main
- Frontend: React 18 + Vite + TypeScript
- Existing scripts: dev, build, preview, lint
- Existing payment provider SDK: not found in package.json
- Existing backend/database SDK: not found in package.json
- Existing test runner/script: not found in package.json
- Existing billing implementation: not found by repository code search
- Build/test execution during planning: NOT RUN

## Planned files

| File | Responsibility | Acceptance criteria |
|---|---|---|
| src/billing/domain/types.ts | Branded IDs, integer minor-unit money, plan/payment/subscription/event types | Strictly typed; no provider-specific SDK imports |
| src/billing/domain/state-machine.ts | Pure legal transition functions | Reject illegal transitions; deterministic tests |
| src/billing/providers/mock-provider.ts | Deterministic synthetic checkout and webhook fixtures | No network, no secrets, no real money movement |
| src/billing/services/billing-service.ts | Mock orchestration, duplicate-event guard, ledger updates | Idempotent within demo service; no client-trusted paid state |
| src/billing/demo/fixtures.ts | Synthetic plans and transaction examples | Every record explicitly marked DEMO |
| src/billing/index.ts | Narrow public exports | No internal implementation leakage |
| src/components/billing/BillingPanel.tsx | Plan selector and demo billing history/status | Persistent DEMO / NOT REAL MONEY notice |
| tests/billing/state-machine.test.ts | Transition tests | Covers allowed and rejected transitions |
| tests/billing/billing-service.test.ts | Idempotency and verification tests | Duplicate, invalid, mismatch, failed and cancelled events covered |
| docs/billing/PROVIDER_ONBOARDING_GATE.md | Adult merchant account and payout readiness | No instructions to bypass eligibility or KYC |
| package.json | Add test script and minimal test dependency only if approved | Lockfile updated consistently; no payment SDK added |

## Implementation sequence

1. Add domain types and state machine.
2. Add mock provider and synthetic fixtures.
3. Add mock billing service with server-authority warning in code comments.
4. Add billing panel without claiming a real subscription is active.
5. Add tests and test script.
6. Add adult-owned provider/payout readiness guide.
7. Run npm run lint, npm run build, and the new test command.
8. Inspect generated bundle for accidental secrets and confirm demo labels.
9. Record evidence and unresolved limitations.

## Hard prohibitions

- No live payment gateway integration in this phase.
- No real merchant account, payout account, bank, card, wallet, or identity details in GitHub.
- No production webhook endpoint or signing secret.
- No migrations, database writes, deployments, merge, or release in this phase.
- No claiming that tests/build passed unless command output proves it.

## Approval required

Reply with the backend direction before source implementation:
- **A — Frontend-only mock:** implement demo billing in the current React app; keep all state in memory and clearly label it as non-persistent demo data.
- **B — Backend contract only:** implement the same mock domain plus documented Supabase Edge Functions or Cloudflare Worker contracts, without provisioning, migrations, secrets, or deployment.

A real provider adapter, real recurring charges, and real payouts remain a separate future project requiring eligible adult merchant ownership and explicit approval.
