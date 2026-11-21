# Phase 101.4 — Isolated Outbox Integration Testing

## Objective

Make the Phase 87 transactional-outbox integration test safe to execute repeatedly in CI without reusing fixed run identities or leaving test-owned rows behind.

## Changes in this phase

- Require explicit `PHASE87_ALLOW_DISPOSABLE_DB_WRITES=true`.
- Require `PHASE87_DATABASE_NAME=infinitex_rehearsal` or another approved `infinitex_test_*` name.
- Restrict the PostgREST URL to a loopback host before constructing the service client.
- Validate the synthetic owner ID as a canonical lowercase UUID.
- Generate a fresh run UUID for each test invocation.
- Include that run UUID in the outbox idempotency key.
- Delete only the invocation-owned step-run and workflow-run records in `finally`.
- Fail the test if cleanup reports an error.
- The outbox migration declares `run_id` with `ON DELETE CASCADE`; deleting the test run therefore removes its dependent outbox event.

## CI provisioning boundary

The Phase 81 workflow starts a disposable PostgreSQL container named `infinitex-phase81-postgres`, replays the candidate migration chain into `infinitex_rehearsal`, seeds synthetic workflow fixtures, and starts a loopback-only PostgREST service. Only that workflow step supplies the explicit Phase 87 opt-in and database-name marker.

The marker is not cryptographic proof of database identity by itself. The actual safety boundary is the workflow's disposable container provisioning, loopback-only endpoint, synthetic credentials, and automatic container destruction. Do not reuse these variables against a hosted, shared, staging, or production database.

## Runtime contract hardening

The shared completion helper now validates:

- owner, run, and step IDs as canonical lowercase UUIDs;
- attempt as a positive safe integer no greater than PostgreSQL's signed 32-bit maximum;
- optional outbox event identity against the run, step, and attempt;
- RPC response cardinality as exactly one row;
- returned step and outbox IDs as UUIDs (or null for outbox ID);
- replay status as an actual boolean.

Malformed input is rejected before RPC invocation. RPC errors are normalized without returning database details to callers.

## Verification gates

Run on the exact branch head:

1. `npm ci`
2. `npm run lint`
3. `npm run test:workers`
4. `npm run test:edge-function-security`
5. `npm run build`
6. Phase 81 disposable PostgreSQL/PostgREST workflow, including Phase 87 Deno integration.

A successful source commit is not a test result. Record the workflow run ID and exact head SHA before declaring this phase verified.

## Explicit exclusions

- No production or hosted database connection.
- No migration application to a live project.
- No provider delivery activation or cron schedule change.
- No PR merge, deployment, or secret modification.
