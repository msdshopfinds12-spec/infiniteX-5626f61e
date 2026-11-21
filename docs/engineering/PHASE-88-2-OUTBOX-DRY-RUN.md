# Phase 88.2 — Validated Outbox Contract and Dry-Run Dispatcher

## Scope

This phase adds a server-controlled event contract and a dry-run-only dispatcher preview. It does not enable automatic event production in either workflow worker and does not deliver events externally.

## Implementation

- `workflow-outbox-contract.ts` defines the allowlisted `workflow.step.completed` event.
- Idempotency keys are deterministic from run ID, step ID, and attempt generation.
- Payloads contain only run ID, step ID, and attempt. Arbitrary callback URLs, scripts, provider names, and routing instructions are not accepted.
- `workflow-completion.ts` accepts an optional validated event descriptor and forwards it through the existing transactional completion RPC. The default remains event-free.
- `outbox-dry-run.ts` creates a pure preview plan. Unknown event types fail closed.
- `simula-outbox-dry-run` requires the existing cron-worker authentication boundary and previews at most ten supplied events. It does not claim rows from PostgreSQL, call a provider, perform network delivery, or mutate event status.

## Safety invariants

1. No automatic event emission is enabled in authenticated or cron workflow workers.
2. No arbitrary URLs, executable payloads, or dynamic provider routing.
3. Dry-run response explicitly reports `claimedFromDatabase: false` and `deliveryPerformed: false`.
4. Input body is bounded to 32 KiB; batch size is capped at ten.
5. The database remains authoritative for transactional completion and idempotency.
6. This branch contains no production migration and requires no new secret.

## Tests added

- Deterministic event identity.
- Invalid identity and forged idempotency rejection.
- Unknown event rejection.
- Dry-run no-delivery invariant.
- Bounded batch behavior.
- Optional completion event forwarding.
- Event/run/step/attempt identity mismatch rejected before RPC.

## Not included / blocked intentionally

- No outbox database claim or finish RPC calls from the dry-run endpoint.
- No cron schedule changes.
- No real notification, email, webhook, AI-provider, or external network adapter.
- No production database migration, secrets, merge, or deployment.

## Next gates

1. Run exact-head automated checks.
2. Inspect PR diff and test failures.
3. Add a disposable PostgreSQL end-to-end test for the complete worker → transactional outbox → dispatcher lifecycle before any live integration.
4. Obtain separate approval before enabling an operational dispatcher or scheduling it.
