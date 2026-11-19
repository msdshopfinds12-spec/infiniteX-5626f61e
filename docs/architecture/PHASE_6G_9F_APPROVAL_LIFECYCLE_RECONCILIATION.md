# Phase 6G.9F — Approval Lifecycle Reconciliation

Status: DESIGN BASELINE — IMPLEMENTATION PENDING
Branch: `feat/infiniteX-zero-budget-implementation`
Scope: reconcile the domain lifecycle, human approval, one-time grant consumption, worker execution claim, and lease acquisition.
Safety: documentation only. No runtime code, SQL, migration, database connection, credentials, deployment, or production mutation.

## 1. Source-confirmed problem

The domain state machine in `src/lib/task-lifecycle.mjs` defines:

`queued → planning → awaiting_approval → approved → running → succeeded|failed`

The approval adapter in `server/ai/approval-task-store-adapter.mjs` currently sends legacy claim requests with:

`fromStatus: awaiting_approval`, `toStatus: running`.

The service in `server/ai/approved-capability-service.mjs` currently treats successful atomic approval claim as sufficient to start the executor. This bypasses the explicit `approved` state and does not return a lease tuple to the executor.

Do not connect the legacy adapter directly to a durable database driver.

## 2. Selected protocol: two durable transitions

Use two distinct, versioned, atomic operations. The human approval decision and worker scheduling are separate events.

### A. `approveTaskWithGrantV1` — human approval

Trusted server input:
- task ID;
- verified principal subject;
- expected task version;
- expected payload SHA-256;
- pinned agent ID/version;
- pinned capability ID/version;
- SHA-256 digest of the one-time approval token;
- idempotency key.

One database transaction must:
1. Resolve the task under the authenticated owner scope.
2. Lock the task and compare status = `awaiting_approval`, version, payload hash, and pinned agent/capability identity.
3. Validate the one-time grant digest, owner, task, action, version, payload, capability, and expiry using database time.
4. Consume the grant exactly once.
5. Transition `awaiting_approval → approved`.
6. Increment task version once and allocate an independent event sequence.
7. Append a redacted human-approval event.
8. Persist the idempotency result.
9. Commit all changes atomically.

A failed check must roll back grant consumption and all state/event writes.

### B. `claimApprovedTaskV1` — worker execution claim

Trusted server input:
- task ID;
- verified owner/principal subject;
- expected task version and payload hash;
- pinned agent/capability identity and versions;
- authenticated worker identity (never browser supplied);
- bounded lease duration;
- owner-scoped idempotency key.

One database transaction must:
1. Resolve and lock the task under owner scope.
2. Require status = `approved` and compare task version, payload hash, and pinned agent/capability identity.
3. Require the approved event/grant reference or equivalent immutable approval evidence.
4. Allocate a fresh lease ID and monotonically increasing fencing token.
5. Set authenticated worker identity and database-clock lease expiry.
6. Transition `approved → running`.
7. Increment task version once and allocate an independent event sequence.
8. Append a redacted execution-claimed event.
9. Persist the idempotency result.
10. Commit and return the authoritative task and lease tuple.

Only after this operation returns a validated `claimed` outcome may the capability executor start.

## 3. Failure and recovery semantics

- If approval transaction fails: task remains `awaiting_approval`; grant remains unconsumed.
- If approval succeeds but no worker claims: task remains `approved`; it is safely queueable/retryable.
- If worker claim fails: task remains `approved`; no executor starts and no lease is active.
- If worker crashes after claim: lease expiry/reclaim policy may recover the task; old fencing tokens must be rejected.
- If executor fails: settle through the lease-fenced failure operation; never silently reset to `approved`.
- If cancellation races with approval or claim: compare-and-swap/version and transaction locking allow only one valid winner.
- If the same idempotency key is replayed with the same request hash: return the same stable outcome.
- If replayed with a different request hash: return a typed conflict.

A consumed approval grant must not be silently reissued or restored after execution claim. Any re-approval policy must be an explicit state-machine command with an auditable event.

## 3A. Identity trust boundary hardening

The versioned protocol adapter requires injected `resolvePrincipalSubject` and `resolveWorkerSubject` functions. It does not trust a plain object merely because it contains a `subject` property. These resolvers must be wired only to the server's verified authentication/session context; never implement them by echoing browser request fields.

The adapter rejects unknown identity objects before invoking the persistence driver. Unit tests cover spoofed principal and worker objects. This is defense-in-depth at the adapter seam, not a substitute for authentication middleware, authorization policy, tenant scoping, or database role enforcement.

## 4. Service and adapter boundaries

### Approval service
- Human approval endpoint calls `approveTaskWithGrantV1`.
- It must not execute a capability.
- Public response must not disclose whether a task belongs to another principal.
- Raw approval tokens are accepted only at the trusted boundary and immediately digested; only the digest is persisted.

### Worker scheduler
- Reads only approved, schedulable tasks.
- Derives worker identity from authenticated worker credentials.
- Calls `claimApprovedTaskV1`.
- Starts the executor only after a typed `claimed` result and a validated lease tuple.
- Propagates lease ID and fencing token to all settlement/renewal calls.

### Legacy compatibility
- Existing `claimTaskForExecution` and `claimTaskWithApproval` callbacks are legacy interfaces.
- Do not silently change their status strings and assume the service is reconciled.
- Introduce versioned callbacks and migrate service wiring with contract tests.
- Keep legacy adapters isolated until all callers have migrated.

## 5. Stable result types

Approval operation:
- `{ outcome: "approved", task }`
- `{ outcome: "conflict" }`
- `{ outcome: "approval_invalid" }`
- `{ outcome: "not_available" }`

Worker claim:
- `{ outcome: "claimed", task, lease }`
- `{ outcome: "conflict" }`
- `{ outcome: "not_available" }`
- `{ outcome: "already_claimed" }`

Infrastructure failures remain distinguishable internally through safe error classes and redacted telemetry. Never expose raw database errors, tokens, or cross-tenant existence details to clients.

## 6. Required test-first acceptance matrix

| Test | Required invariant |
|---|---|
| Approval by correct owner | exactly one awaiting → approved transition |
| Wrong owner | non-enumerating rejection; no mutation |
| Wrong task version/hash | conflict; grant not consumed |
| Wrong agent/capability version | rejection; grant not consumed |
| Expired approval grant | database time rejects; no state/event mutation |
| Concurrent approval replay | exactly one grant consumption and event |
| Approval transaction event failure | full rollback including grant consumption |
| Approved task without worker | remains approved and safely schedulable |
| Worker claim | exactly one approved → running transition and lease |
| Wrong worker identity | rejected; no lease |
| Concurrent workers | exactly one claim wins |
| Replayed worker idempotency key | stable same result |
| Idempotency key with different payload | conflict |
| Stale fencing token | renewal/settlement rejected |
| Worker crash and lease expiry | reclaim increments fence; old worker is stale |
| Cancellation vs worker claim | exactly one state transition wins |
| Executor invocation | never called before a validated claimed+lease result |
| Legacy adapter invocation | cannot bypass the approved intermediate state |

Use deterministic barriers and independent PostgreSQL connections for concurrency tests; do not rely on arbitrary sleeps.

## 7. Migration strategy (code-level only until separately approved)

1. Add tests for the two operation contracts and service sequencing.
2. Add new versioned adapter methods without deleting legacy methods.
3. Add a service API that separates `approve` from `executeApproved`.
4. Require worker claim to return a complete lease tuple before executor invocation.
5. Update in-memory test driver to model the same states and version increments.
6. Add PostgreSQL 17 disposable CI integration harness only after the schema/RPC proposal is reviewed.
7. Migrate internal callers behind a feature flag or explicit adapter selection.
8. Remove legacy callbacks only after repository-wide caller search, tests, and audit.
9. No live migrations, backend activation, credentials, paid services, or deployment without separate human approval.

## 8. Zero-budget implementation options

1. **Recommended:** provider-neutral adapter contract + deterministic in-memory fake for unit/contract tests; no runtime database dependency.
2. **Integration proof:** PostgreSQL 17 service container in GitHub Actions; no paid managed database needed.
3. **Optional fast test:** SQLite only for portable query/serialization tests; it does not prove PostgreSQL row locks, transaction isolation, or RLS.
4. **Supabase:** only after backend ownership and runtime are confirmed; never use a live project for race/rollback experiments without explicit approval.

## 9. Exit criteria

Phase 6G.9F is not complete until:
- both operations have versioned contracts and typed outcomes;
- service sequencing proves approval cannot directly start execution;
- worker identity and lease fencing are enforced;
- unit and contract tests pass;
- PostgreSQL integration tests prove concurrency, rollback, expiry, and role isolation;
- security review confirms no browser-trusted principal/worker IDs and no raw token persistence.

Current conclusion: DESIGN BASELINE + VERSIONED ADAPTER PROTOTYPE. The existing approved-capability service still uses the legacy one-step claim path and is not yet wired to this adapter. The adapter has no durable driver. Runtime reconciliation and production readiness are therefore NOT VERIFIED.
