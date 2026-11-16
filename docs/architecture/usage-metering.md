# Usage metering and quota reservations

## Scope
This module is a provider-neutral accounting primitive. It does not issue API keys,
call model providers, process payments, create subscription records, or promise
unlimited tokens. The caller supplies a limit resolved from trusted server-side
entitlements and an authenticated tenant identity.

## Transaction contract
- The caller owns the SQLAlchemy transaction and must commit or roll it back.
- `reserve_usage` atomically increments reserved units only when
  `used_amount + reserved_amount + requested_amount <= limit_amount`.
- A tenant-scoped idempotency key prevents duplicate reservations. Reusing it
  with a different metric, amount, period, or limit is rejected.
- `commit_usage` moves units from reserved to used.
- `release_usage` returns reserved units after an unsuccessful operation.
- Reservation state transitions are conditional updates; a second transition
  fails rather than consuming/releasing twice.
- Every query and mutation is scoped by tenant_id. The tenant must come from a
  verified server-side principal, never a request body or browser-supplied plan.

## Important limitations
- Models are not migrated or deployed by this change. Production PostgreSQL
  schema changes require a reviewed Alembic migration and explicit approval.
- A background expiry reconciler is not included. Expired reservations must be
  reconciled by a separately designed worker before their reserved capacity is
  reusable. Expired reservations are not silently released on request paths.
- This primitive does not yet enforce quotas in chat/agent/model execution APIs.
  Integration is a separate step after policy values and trusted tenant context
  are confirmed.
- SQLite unit tests validate core behavior, not PostgreSQL concurrency behavior.
  Production concurrency validation requires PostgreSQL integration tests.
- Supported atomic bucket initialization dialects are SQLite and PostgreSQL.

## Next integration gate
Before wiring into execution routes, define approved per-plan metric policies,
period boundaries, trusted tenant resolution, cost semantics (tokens vs provider
cost), and the failure/retry contract. Add PostgreSQL race tests and audit events.
