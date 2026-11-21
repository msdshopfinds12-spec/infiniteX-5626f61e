# Phase 103.7 — Outbox Idempotency Verification

## Objective

Prove that lease-fenced workflow-step completion behaves safely under retries and rejects conflicting replays. The verification runs only against the disposable `infinitex_rehearsal` PostgreSQL database in the existing isolated GitHub Actions integration workflow.

## Test cases added

The Phase 103.4 lease-concurrency scenario now also verifies:

1. **Stale-generation completion rejection** — the first lease generation attempts completion after a reclaim. The RPC must reject it before it can create an outbox event.
2. **First completion** — the current generation completes the step and event. The response must contain a step-run ID, outbox ID, and `replayed = false`.
3. **Exact retry** — the same generation repeats the identical completion. The RPC must return `replayed = true` and exactly the same step-run and outbox IDs as the first call.
4. **Payload conflict** — reusing the idempotency key with altered event payload must fail with `outbox_idempotency_conflict`.
5. **Output mismatch** — reusing the event identity with a different step output must fail with `outbox_replay_step_state_mismatch`.

The database migration enforces uniqueness on `(owner_id, idempotency_key)`. The replay assertion additionally requires the same persisted outbox ID to be returned. The current PostgREST integration workflow exposes only the `public` schema, so this test deliberately does not broaden API schema exposure merely to query the private outbox table.

## Safety boundaries

- Requires the existing explicit `PHASE1034_ALLOW_DISPOSABLE_DB_WRITES=true` test opt-in.
- Requires database name `infinitex_rehearsal`.
- Requires loopback PostgREST on port `3000`.
- Uses the pre-seeded synthetic owner fixture and random synthetic workflow/run/step IDs.
- Cleanup targets only the exact synthetic run and workflow created by this test.
- No production database, migration, secrets, billing, deployment, merge, or public API schema changes are part of this phase.

## Verification status

- **Implemented:** test assertions and workflow branch trigger.
- **Not yet verified:** GitHub Actions execution for this branch, Deno type-check/runtime result, and end-to-end disposable database result.
- **Not claimed:** direct private-table row-count inspection, production behavior, or resolution of the earlier PostgREST `PGRST003` incident.

## Follow-on work

- Phase 103.8: experimentally verify lock ordering under competing completion/replay transactions.
- Phase 103.9: controlled connection-pool A/B tests with and without gateway restart.
- Phase 104: rollback/atomicity tests under deliberately induced database failures.
