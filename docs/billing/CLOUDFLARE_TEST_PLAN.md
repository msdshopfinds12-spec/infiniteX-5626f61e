# InfiniteX Cloudflare Billing — Test Plan

**Status:** Test design only; no tests executed by this plan
**Target:** Cloudflare Worker + D1 candidate
**Mode:** Mock-only

## 1. Test layers

1. Domain unit tests: money validation, state machine, subscription policy, idempotency.
2. Worker handler tests: routing, validation, request IDs, CORS, error envelopes, auth decisions.
3. D1 integration tests: prepared queries, uniqueness, ownership, atomic batch/rollback, pagination.
4. Security tests: spoofed user ID, invalid/expired token, cross-user reads, payment-status forgery, body limits, malformed JSON.
5. Local end-to-end tests: frontend typed client to local Worker to isolated local D1.
6. Regression tests: existing frontend build/lint plus billing test suite.

## 2. Required scenarios

| Scenario | Expected result |
|---|---|
| Published plan list | Only public plan fields returned |
| Unknown/unpublished plan | Rejected; no checkout created |
| Checkout without auth | 401; no mutation |
| Forged userId/amount/status | Rejected or ignored; verified identity/server price wins |
| Same idempotency key and request | Same logical checkout result |
| Same key with different request | Conflict |
| User A requests User B record | Not found/forbidden without data leakage |
| Browser redirect says paid | No entitlement change |
| Mock fixture loaded | DEMO / NOT REAL PAYMENT visible |
| D1 constraint violation | Safe error; no partial transition |
| Duplicate provider event (future) | No duplicate ledger/subscription effect |
| Invalid webhook signature (future) | Rejected; no mutation |
| Amount/currency mismatch (future) | Rejected; no entitlement |
| D1 unavailable | Fail closed; no access grant |
| Oversized body/page size | Rejected or safely bounded |

## 3. Tooling strategy

Use Cloudflare's recommended Workers Vitest integration when runtime implementation begins, after checking current compatible versions and setup. Keep domain tests independent of Cloudflare runtime. Use isolated local D1 for integration tests; never point tests at production. Do not create a D1 database or run migrations in this planning phase.

Record exact commands, tool versions, exit codes, and output. A test is PASS only when executed and supported by output; otherwise mark NOT RUN or BLOCKED.

## 4. Baseline

Previously inspected package.json exposed dev, build, preview, and lint scripts; no test runner or Worker package was found. Recheck before runtime implementation.

## 5. Exit criteria

- Unit and integration tests pass.
- Negative authorization and ownership tests pass.
- D1 rollback and idempotency are demonstrated.
- Mock mode cannot reach a live provider.
- Existing frontend build/lint pass.
- No secrets in source, history, or frontend bundle.
- Untested paths are release blockers.
