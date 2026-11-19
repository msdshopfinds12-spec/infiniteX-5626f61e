# Phase 6G.9 — Durable PostgreSQL Driver Readiness Gate

Status: DESIGN REVIEW REQUIRED — NOT READY FOR DRIVER IMPLEMENTATION
Branch: `feat/infiniteX-zero-budget-implementation`
Reviewed against: current approval SQL proposal, approval adapter, lease adapter, and atomic-claim contract.

## Executive decision

Do not wire a production PostgreSQL/Supabase driver yet. The repository has useful provider-neutral contracts, but the SQL proposal is not yet a complete implementation of those contracts. Implementing a driver now would either leave lease fencing incomplete or create unsafe assumptions about transaction semantics.

This review is documentation-only. It does not alter database state.

## Verified repository facts

- The approval adapter exposes snapshot reads, legacy claims, and an atomic approval+claim callback.
- The atomic approval SQL proposal consumes a digest-bound grant and transitions a task to running in one transaction.
- The lease adapter requires atomic claim, renew, complete, and fail store operations.
- The lease adapter expects a monotonically increasing fencing token.
- The current SQL proposal has no persistent fencing-token column or lease renew/complete/fail RPCs.
- The current SQL claim RPC returns a lease UUID and expiry, but not a fencing token.
- The SQL proposal is outside `supabase/migrations/` and explicitly marked review-only.
- No concrete database driver or PostgreSQL integration test suite is present in the reviewed files.

## Blocking contract mismatches

| Area | Current proposal | Required before driver |
|---|---|---|
| Fencing | Lease UUID + expiry only | Persistent monotonic fencing token, incremented on every claim/reclaim |
| Claim output | Task ID, version, lease ID, expiry | Include fencing token and exact adapter snapshot mapping |
| Renewal | No RPC | Conditional renewal matching task, owner, lease ID, fencing token, version, running state, and unexpired lease |
| Completion/failure | No RPC | Atomic fenced transition, lease clear, version increment, event append |
| Event sequencing | Uses task version as event sequence | Define concurrency-safe event sequence independent of assumptions about task version, or formally constrain and test equivalence |
| Actor identity | SQL accepts owner ID parameter | Derive owner from verified server auth context; never trust browser input |
| Idempotency | Unique owner/key column exists | Define create/retry behavior and payload-hash conflict semantics |
| Tenant deletion | Cascading owner/task deletes | Decide retention/audit policy and validate whether cascade deletion is acceptable |
| Time authority | Claim uses DB clock | All lease validity checks must use database time; client timestamps are advisory only |

## Required design before implementation

1. **Single canonical task model.** Define exact status transitions, task version semantics, event sequencing, idempotency behavior, and immutable agent/capability/payload bindings.
2. **Approval issuance.** Persist only a cryptographic token digest. Bind grant to owner, task version, payload hash, agent version, capability version, and expiry.
3. **Atomic claim.** Lock task and grant in a deterministic order; consume grant and claim task in one transaction; allocate next fencing token atomically; append event in the same transaction.
4. **Lease renewal.** Require the full active lease tuple and increment task version while preserving lease ID and fencing token.
5. **Fenced settlement.** Complete/fail only if the same owner, lease ID, fencing token, version, running state, and unexpired lease match. A stale worker must affect zero rows.
6. **Stale recovery.** Reclaim only expired running tasks; increment fencing token; record recovery event; ensure prior workers cannot settle.
7. **Idempotency.** Same owner/key + same canonical payload returns the existing task; same owner/key + different payload returns a conflict.
8. **Security.** Server-only database credentials; no service-role key in browser bundles; owner derived from verified authentication; least-privilege grants; bounded payload and event metadata; safe error mapping.
9. **Observability.** Structured event IDs and correlation IDs without raw approval tokens, secrets, or sensitive payload data.
10. **Operational policy.** Retention, backup/restore, retry budgets, maximum task age, rate limits, and cleanup policy.

## Mandatory verification suite

Use a disposable PostgreSQL 17 instance, never the live project, for initial validation.

- Migration applies cleanly from an empty database.
- Migration is repeatable or explicitly fails safely on a second application.
- Two concurrent claims using the same approval produce exactly one winner.
- Two concurrent renewals using the same expected version produce at most one winner.
- Expired lease cannot renew or settle.
- Reclaimed task increments fencing token; old worker cannot complete/fail.
- Approval replay is rejected.
- Wrong owner, task version, payload hash, agent version, or capability version is rejected.
- Transaction rollback leaves neither consumed grant nor partial task transition/event.
- Idempotency same-payload retry returns same task; different-payload retry conflicts.
- RLS/grants prove browser roles cannot access private task, event, or grant tables.
- Tests assert no secrets or raw approval tokens appear in logs/events.

## Implementation sequence

- **6G.9A:** approve canonical data model and RPC signatures; no DB changes.
- **6G.9B:** revise review-only SQL proposal to add fencing counter and complete lease lifecycle RPCs.
- **6G.9C:** validate proposal against disposable PostgreSQL 17 with concurrency and rollback tests.
- **6G.9D:** implement server-only driver behind the existing adapters and contract tests.
- **6G.9E:** security audit, CI, and documentation.
- **6G.9F:** only after separate explicit approval, consider a live migration to a confirmed backend.

## Backend decision remains blocked

The repository does not prove that Ashaa-INX is the deployed InfiniteX backend. Do not infer backend ownership from the existence of a candidate Supabase project. Confirm the intended backend and its free-tier constraints before driver wiring.

## Alternatives

- **Preferred:** PostgreSQL transaction/conditional updates with a persistent fencing counter, if a confirmed PostgreSQL backend exists.
- **Alternative:** another durable database only if it offers atomic compare-and-set, transactional event writes, and monotonic fencing.
- **Temporary demo:** in-memory store, explicitly labeled non-durable and single-process.
- **Rejected:** separate approval consumption and task claim; expiry-only leases; client-supplied owner identity; fake persistence; applying review SQL directly to production.

## Release gate

No production-ready claim until the disposable PostgreSQL integration suite passes, security review is complete, backend ownership is confirmed, and the user explicitly approves any live migration or deployment.
