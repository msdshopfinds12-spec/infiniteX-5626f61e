# InfiniteX Billing Security Threat Model

**Status:** DESIGN REVIEW CHECKLIST — not a certification or completed runtime audit  
**Scope:** Option B backend contract; mock-only; no deployed service

## 1. Assets and trust boundaries

Assets:
- User identity and subscription entitlement.
- Plan prices and checkout snapshots.
- Payment references and normalized payment status.
- Provider webhook authenticity and event identity.
- Append-only billing event and ledger history.
- Future server-only secrets (not present in this phase).

Trust boundaries:
1. Browser/client → authenticated backend API.
2. Payment provider → public webhook endpoint (future).
3. Backend service → database/storage.
4. Admin/operator → privileged billing controls.
5. CI/build pipeline → deployed artifacts and secret configuration (future).

## 2. Threats and required controls

| Threat | Required control |
|---|---|
| Client forges `paid` status or edits redirect URL | Ignore client status; backend-only entitlement transition |
| User reads another user's invoice/payment | Derive subject from verified auth; enforce RLS/equivalent ownership on every query |
| Forged/replayed webhook | Raw-body signature verification, timestamp window, unique provider event ID, idempotent processing |
| Amount/currency substitution | Re-read immutable checkout snapshot; compare exact integer amount and currency |
| Duplicate webhook creates duplicate subscription/ledger entry | Unique constraints + transaction-safe idempotency |
| Race between concurrent events | Atomic conditional state transition and transaction/locking strategy |
| Secret leaks into Vite bundle or logs | Server-only secret storage, env allowlist, log redaction, bundle inspection |
| Mock route abused in production | No public mock injection route; mock adapter isolated to test/demo environment |
| Admin grants access without payment | No manual paid toggle; audited break-glass workflow requires separate design/approval |
| Denial-of-service or oversized webhook | Body size cap, rate limits, timeouts, provider IP controls only as supplemental defense |
| Data tampering or deletion | Append-only event/ledger policy, restricted DB permissions, audit log |
| Refund/dispute leaves access active | Explicit reversal/dispute state machine and entitlement review policy |

## 3. Required webhook algorithm (future live integration)

1. Enforce method, content type, request size, and timestamp/freshness bounds.
2. Capture raw request bytes before JSON parsing.
3. Verify the signature exactly as specified by the selected provider's current official docs.
4. Reject invalid signature, wrong environment, wrong merchant/account, unsupported event type, and stale event.
5. Parse and normalize only verified payload fields.
6. Begin a transaction; insert event under unique provider/event identity.
7. If duplicate, return a safe idempotent acknowledgement without repeating side effects.
8. Compare payment reference, checkout reference, amount, and currency with server-side records.
9. Apply only a legal state transition; create ledger entries using unique idempotency keys.
10. Commit before returning success; record a redacted processing outcome.

No webhook endpoint or signing secret exists in this phase.

## 4. Authorization requirements

- User routes require verified authentication.
- User ID is derived from verified claims, never request JSON, query string, or a hidden form field.
- Every query is owner-scoped, even when RLS/equivalent policy is enabled.
- Client has no direct write permission to financial state.
- Privileged service credentials are server-only and narrowly scoped.
- Administrative reads and actions require role checks, audit logging, and least privilege.

## 5. Mock isolation requirements

- Mock provider performs no network I/O and has no provider credentials.
- Fixtures use synthetic names, IDs, and amounts.
- Every mock transaction is labeled `DEMO — NOT REAL MONEY`.
- Mock state cannot grant production entitlement.
- No unauthenticated browser endpoint may inject a successful payment event.
- Build-time/runtime configuration must fail closed if mock mode is accidentally exposed in a production environment.

## 6. Pre-live audit checklist (all currently NOT TESTED)

- [ ] Auth token/session validation and expiry behavior.
- [ ] Owner isolation tests for every read/write path.
- [ ] RLS policies or Worker authorization checks reviewed.
- [ ] Raw-body signature verification tested with provider test vectors.
- [ ] Duplicate/replayed event tests.
- [ ] Amount, currency, merchant, environment, and checkout reference mismatch tests.
- [ ] Concurrent event and transaction rollback tests.
- [ ] Secret scanning and production bundle inspection.
- [ ] Refund, dispute, cancellation, expiry, and chargeback policy tests.
- [ ] Rate limits, request-size caps, observability, and incident response.
- [ ] Reconciliation process and financial operations review.
- [ ] Adult merchant owner confirms provider eligibility, KYC, payout account, and official provider requirements.

## 7. Residual risks / decisions

- Runtime, database, auth provider, and provider gateway are not selected.
- No implementation or execution evidence exists.
- RLS policy details and transactional semantics must be validated against the chosen runtime/database.
- Financial, tax, consumer-protection, privacy, and refund terms require qualified adult/business review before live launch.
- A mock demonstration is not proof of payment processing or production readiness.

