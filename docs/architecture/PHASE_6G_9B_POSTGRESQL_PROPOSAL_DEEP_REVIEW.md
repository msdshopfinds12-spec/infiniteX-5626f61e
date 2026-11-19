# Phase 6G.9B — PostgreSQL Proposal Deep Review

Status: REVIEW FINDINGS — NOT APPROVED FOR EXECUTION
Branch: `feat/infiniteX-zero-budget-implementation`
Review scope: repository SQL proposal, canonical task/RPC contract, existing server adapters, and package/runtime evidence.
Safety: documentation-only review. No SQL was applied, no database was connected, no credentials were read or changed, and no production or deployment action was taken.

## 1. Executive decision

**Do not promote the existing SQL proposal into `supabase/migrations/` and do not implement a production driver yet.**

The repository contains an earlier review-only proposal at:

`supabase/proposals/20261119_ai_approval_persistence_proposal.sql`

That proposal is a useful starting point for atomic approval consumption and task claim, but it is not compatible with the later canonical lease-fencing contract or the current lease adapter. It is also explicitly Supabase-specific, while backend ownership is still unconfirmed.

Recommended route: preserve the proposal unchanged as historical design evidence; resolve the contract mismatches in a new provider-neutral design; then create a separate disposable PostgreSQL validation harness. Only select Supabase after an explicit backend decision.

## 2. Verified repository evidence

- The SQL file is under `supabase/proposals/`, not `supabase/migrations/`, and labels itself review-only.
- The SQL creates `private.ai_tasks`, `private.ai_task_events`, and `private.ai_approval_grants`.
- The proposal currently defines one lifecycle RPC: `private.claim_ai_task_with_approval(...)`.
- The existing server adapter expects a durable store operation `claimTaskWithLease`, returning a running snapshot containing a lease identity and a positive fencing token.
- The existing lease adapter requires atomic `claimTaskWithLease`, `renewTaskLease`, `completeTaskWithLease`, and `failTaskWithLease` operations.
- The canonical 6G.9A contract separately defines task version, fencing token, and event sequence, plus claim, renew, complete, fail, recover, cancel, create, and approval issuance operations.
- The package manifest shows a Vite/React frontend and Node's built-in test runner. It does not establish a PostgreSQL client dependency or an operational backend connection.
- No PostgreSQL integration test result or live backend ownership proof was established during this review.

## 3. Critical incompatibilities — blockers

### P0 — Persistent fencing token is missing

The proposal's `ai_tasks` table has `task_version` and `lease_id`, but no persistent monotonic `fencing_token` and no worker lease-owner field. The claim RPC returns a lease ID and expiry but no fencing token.

The current adapter validates `snapshot.lease.fencingToken` and requires it to be a positive safe integer. A driver over this SQL cannot satisfy that contract without inventing an unsafe process-local token.

**Required correction:** add a per-task persistent fencing counter. Increment it atomically on every successful claim/reclaim. Return it from claim and renewal. Every renew/complete/fail predicate must compare the full active lease tuple, including fencing token and lease ID.

### P0 — No renewal, settlement, recovery, or cancellation RPCs

The SQL only implements approval consumption + initial claim. It does not implement the methods required by the existing lease adapter or the canonical RPC contract.

**Required correction:** design and test dedicated transactional RPCs for renew, complete, fail, recover-expired, cancel, task creation, and approval issuance. Do not expose a generic status-update operation.

### P0 — Event sequence is coupled to task version

The claim RPC writes `event_sequence = claimed_task_version`. The canonical contract explicitly treats task version and event sequence as independent monotonic counters. Future non-event version increments or multiple events per transaction can cause gaps or collisions.

**Required correction:** maintain a separate per-task `event_seq` (or safely serialize allocation under the task row lock), increment it in the same transaction as the task mutation, and enforce `UNIQUE(task_id, event_sequence)`.

### P0 — Backend/provider ownership is unresolved

The proposal references `auth.users`, `anon`, `authenticated`, and `service_role`, and its header targets the Ashaa-INX Supabase project. These are provider-specific assumptions, not proof that InfiniteX's active backend is Supabase.

**Required correction:** confirm the backend owner and deployment boundary first. Keep the lifecycle contract provider-neutral. Do not read, rotate, request, or configure credentials as part of this phase.

### P1 — Owner authorization is delegated outside the SQL function

The claim function accepts `p_owner_id` and filters rows by it, but does not itself derive the principal. Its comments correctly say a trusted Edge Function must validate actor identity. This means the database function is safe only when its caller boundary is correctly enforced.

**Required correction:** document and test the trusted server boundary. If Supabase is selected, derive the end-user identity from verified auth context and never trust a browser-supplied owner ID. Ensure only the intended server role can execute privileged RPCs. Evaluate whether a narrowly scoped security-definer function is necessary; do not change security mode casually.

### P1 — Canonical status vocabulary differs

The SQL uses `planned`, `awaiting_approval`, `running`, and `succeeded`; the 6G.9A contract uses `queued`, `running`, and `completed`. Existing JavaScript approval code expects `awaiting_approval`.

**Required correction:** publish one canonical state vocabulary and a deliberate adapter mapping. Do not perform a silent rename. Preserve a distinct approval-pending state if required by the application state machine.

### P1 — Idempotency and event coverage are incomplete

The proposal has an owner-scoped unique idempotency key, but the shown RPC set does not yet define task creation/replay semantics or approval issuance event writes. A uniqueness constraint alone does not implement same-key/same-payload replay and same-key/different-payload typed conflict.

**Required correction:** add a transactional create operation with payload-hash comparison and deterministic conflict outcomes. Define event coverage for every successful state transition and ensure failed transactions append no event.

## 4. Additional safety and data-model review

- Keep raw approval tokens out of persistence. Persist only a digest; the token must have sufficient cryptographic entropy.
- Define payload canonicalization before hashing. A hash over non-canonical JSON serialization is not a stable semantic identity.
- Add explicit lease tuple consistency constraints: running implies a complete lease tuple; non-running implies no active lease tuple.
- Define how worker identity is authenticated. A caller-provided worker label is not proof of worker identity.
- Bound all text, JSON payloads, event metadata, result references, and normalized error codes.
- Review `ON DELETE CASCADE` carefully for audit retention, user deletion requirements, and backup/restore. Do not assume permanent audit retention if owner deletion cascades.
- Keep event rows append-only for application roles; no ordinary update/delete permission should be granted to runtime callers.
- Make conflict outcomes stable and non-enumerating across tenants.
- Use database time for all lease validity checks. App-provided timestamps must not decide expiry.
- Ensure the function's lock order is consistent across all RPCs to reduce deadlock risk.
- Add transaction rollback tests proving task, approval grant, lease, and event state all roll back together.

## 5. Recommended target architecture

```text
React / Browser
    |
    | authenticated request; no database credentials
    v
Trusted server/API boundary
    |
    | derives verified principal; validates schema and capability
    v
Provider-neutral task service
    |
    | typed adapter contract
    v
Durable task-store driver
    |
    | one transaction per lifecycle operation
    v
PostgreSQL (provider not yet selected)
    |-- tasks + persistent fencing counter
    |-- single-use approval grants
    |-- append-only task events
    |-- atomic lifecycle RPCs
    |-- least-privilege roles
    v
Worker executor
    |-- receives complete lease tuple
    |-- all writes fenced by lease ID + fencing token + version
    v
External capability boundary (allow-listed, approval-gated)
```

The in-memory repository remains a demo/test adapter only. It must never be described as durable persistence.

## 6. Alternatives ranked by safety and cost

1. **Preferred: provider-neutral PostgreSQL contract + disposable local PostgreSQL 17 tests.** Zero production impact; enables real transaction and concurrency validation. Requires an available local/CI PostgreSQL runtime.
2. **Conditional: Supabase implementation.** Use only after the user confirms Ashaa-INX is the intended backend and reviews the exact migration, RLS, grants, and operational cost. No live changes in this phase.
3. **Alternative: another managed PostgreSQL provider.** Viable only if it supports required transactions, row locks, constraints, trusted server execution, and testable role isolation.
4. **Fallback: in-memory adapter.** Free and useful for UI/demo/unit tests, but explicitly non-durable and not production task execution.
5. **Rejected: browser-direct database writes, client-clock lease checks, process-local fencing counters, non-atomic approval consumption, or a generic unrestricted task update endpoint.**

## 7. Phase 6G.9B implementation gates

### Gate A — contract alignment
- Reconcile state names and adapter result types.
- Add persistent fencing token and independent event sequence to the canonical model.
- Define complete RPC input/output schemas and typed error outcomes.
- Confirm trusted principal and worker identity boundaries.

### Gate B — SQL design (still review-only)
- Produce provider-neutral PostgreSQL DDL and RPC definitions in a new proposal file.
- Include constraints, indexes, role grants, append-only event rules, and lock order.
- Keep all proposed SQL outside executable migration directories.

### Gate C — disposable integration harness
- Pin PostgreSQL major version (17) and test image/runtime.
- Run clean install and repeat-install checks in a disposable environment.
- Use independent connections and deterministic barriers for concurrency races.
- Verify rollback, replay, wrong-owner, stale-worker, expiry, and role-permission cases.

### Gate D — driver implementation
- Implement only after Gates A–C pass.
- Map database outcomes to the existing adapter contract without dropping version, lease ID, fencing token, expiry, or conflict semantics.
- Keep secrets server-only and add structured redacted logs.

### Gate E — human approval
- Separate approval is required before any live migration, credential configuration, paid service, deployment, or production data change.

## 8. Acceptance criteria

The PostgreSQL driver is not eligible for release until all are true:

- One approval grant can be consumed by at most one concurrent claim.
- Every claim/reclaim advances the persistent fencing token exactly once.
- Old workers cannot renew, complete, or fail after a newer fencing epoch exists.
- Expired leases cannot renew or settle.
- Every successful state transition and its event commit atomically.
- Event sequence is unique and independent of task version.
- Idempotency behavior is deterministic and tested.
- Cross-tenant access and browser-role access are denied.
- Rollback leaves no partial task/grant/event mutation.
- All adapter, unit, integration, browser-boundary, and relevant CI checks pass with recorded run evidence.

## 9. Current decision

**BLOCKED from SQL promotion and driver implementation.** The earlier proposal is valuable but materially incomplete against the current contract. Continue with contract reconciliation and a new review-only SQL design. No database mutation or deployment is authorized by this document.
