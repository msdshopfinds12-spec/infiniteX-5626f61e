# InfiniteX Billing — D1 Logical Data Contract

**Status:** DESIGN ONLY — no SQL, migration, or D1 database created
**Storage candidate:** Cloudflare D1
**Mode:** synthetic data only

## 1. Principles

- D1 is a candidate relational source of truth, not a payment processor.
- Use parameterized prepared statements; never interpolate untrusted values into SQL.
- Store money as integer minor units and explicit ISO currency.
- Keep financial events and ledger history append-only.
- Derive ownership from verified auth context and scope every query by that subject.
- Use database constraints as defense in depth.
- Never store card numbers, CVV, wallet PINs, bank credentials, payout details, or raw bearer tokens.

## 2. Proposed entities

### billing_plans
Primary key id; unique code; display name; amount minor; currency; interval unit/count; published flag; version; timestamps. Price is server-managed.

### checkout_sessions
Primary key; owner subject; plan ID; immutable plan/price snapshot; status; idempotency key hash; mock/provider code; expiry; timestamps. Unique idempotency scope by owner + operation + key hash.

### payments
Primary key; owner subject; checkout ID; amount minor; currency; status; optional provider reference; paid timestamp; timestamps. Provider reference uniqueness is scoped to provider/account for any future live integration.

### subscriptions
Primary key; owner subject; plan ID; status; period start/end; cancellation-at-period-end flag; timestamps. Historical records follow an approved retention policy.

### subscription_entitlements
Primary key; owner subject; subscription ID; feature key; effective start/end; creation timestamp. Entitlements are checked by trusted server-side authorization.

### billing_events
Primary key; provider code; provider event reference; event type; payload digest; signature-verified flag; processing status; received/processed timestamps; failure code. Unique provider + event reference. Raw webhook body is not stored by default.

### billing_ledger_entries
Primary key; owner subject; optional payment/event references; entry type; amount minor; currency; unique idempotency key; creation timestamp. Append-only; corrections use compensating entries.

### billing_reconciliation_runs
Primary key; provider code; start/end timestamps; status; matched/mismatch counts; summary digest. No credentials or full provider exports.

## 3. Relationships and constraints

- One plan version may be referenced by many checkout sessions.
- Checkout sessions retain immutable price snapshots.
- Failed payment attempts may be retained; duplicate successful settlement for one purchase must be prevented.
- A user may have historical subscriptions; explicit policy selects entitlement source.
- One verified event causes at most one logical transition.
- Ledger rows reference their source event/payment where applicable.
- Validate non-negative amount, currency format, status values, foreign keys, and timestamps.
- Unique keys cover provider/event identity, provider/payment identity, owner/operation/idempotency key, and ledger idempotency key.

## 4. Ownership and writes

- Public users read published plan metadata only.
- Authenticated users read their own subscription and payment history only.
- Client has no direct insert/update/delete for payments, subscriptions, entitlements, events, or ledger.
- Worker writes through least-privilege repository methods.
- No manual paid toggle.
- Every query includes ownership scope even after route authentication.

## 5. D1 query and transaction requirements

- Use prepared statements and bound values.
- Group logically atomic writes with the documented D1 batch/transaction mechanism.
- Test rollback and constraint behavior before relying on it.
- Use deterministic ordering and cursor pagination.
- Add indexes based on query-plan review.
- Do not assume a multi-request workflow is one transaction.
- Retry only idempotent operations.
- Consider D1 Sessions/bookmarks if read replication is enabled and read-after-write consistency matters.

## 6. Migration gate

A future migration must have exact schema/constraints, forward and recovery strategy, local validation, backup expectations, ownership tests, and separate approval before any remote apply. This document is not SQL and does not authorize migrations.
