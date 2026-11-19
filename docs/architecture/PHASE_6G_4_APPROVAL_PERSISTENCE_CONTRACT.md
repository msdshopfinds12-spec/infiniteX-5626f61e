# Phase 6G.4 — AI Approval Persistence Contract

Status: PROPOSAL ONLY — NOT APPLIED
Target candidate: Ashaa-INX (vepacoemkhudamfaccah), pending final backend and cost confirmation.
Branch: feat/infiniteX-zero-budget-implementation

## Scope

This milestone produces a reviewable SQL proposal and a testable contract. It does not execute DDL, create a Supabase migration, deploy an Edge Function, or connect the InfiniteX frontend.

## Design decisions

- Keep Simula's existing workflow tables and queue untouched.
- Put approval-specific records in the non-exposed private schema.
- Keep all client roles (anon, authenticated) without table or function privileges.
- Grant only the trusted service_role the narrow database access needed by server code.
- The trusted Edge Function must verify the user's access token with Supabase Auth and derive the owner ID itself. Never accept a browser-supplied owner ID as authorization.
- Store only a SHA-256 digest of a high-entropy, one-time approval token; never persist the raw token.
- Bind approval to task version, canonical payload hash, agent ID/version and capability ID/version.
- Claiming consumes the grant and transitions the task to running in one database transaction.
- Return a lease/fencing ID; future completion and renewal RPCs must require the exact active lease ID.

## Proposed files

- supabase/proposals/20261119_ai_approval_persistence_proposal.sql — review-only SQL, intentionally outside supabase/migrations/.
- docs/architecture/PHASE_6G_4_APPROVAL_PERSISTENCE_CONTRACT.md — architecture, constraints and test gate.

## Transaction invariant

A claim succeeds only if all of these are simultaneously true:

1. The task exists and belongs to the verified owner.
2. Its state is awaiting_approval.
3. Its task version and payload hash match the approval snapshot.
4. Its agent and capability IDs and versions match.
5. The approval token digest matches an unconsumed, unexpired grant bound to that exact snapshot.
6. The grant is consumed, task transitions to running, task version increments, lease ID is assigned, and an audit event is inserted in one transaction.

A failed claim returns no row. An unexpected task-update conflict raises a serialization-style error, rolling back the grant consumption and event insert.

## Critical integration note

The current JavaScript adapter is a generic storage seam. Its existing claim method expects fromStatus: awaiting_approval and toStatus: running, which this proposal matches. However, the adapter currently does not pass an approval-token digest to the driver. A follow-up adapter/service change is required before this SQL can be called safely. Do not wire the RPC into the current adapter until the approval service's token lifecycle and function contract are reconciled.

## SQL review caveats

- The SQL is a proposal, not yet validated by executing it against a disposable PostgreSQL 17 database.
- It assumes the Supabase roles anon, authenticated, and service_role exist.
- It assumes a trusted server process calls the claim function with a verified owner ID.
- The database function is SECURITY INVOKER, has an empty search path, and schema-qualifies referenced objects.
- The proposal deliberately omits task creation, approval issuance, completion, lease renewal, cleanup, retention and RLS policy creation. These require separate reviewed contracts.
- Service-role access bypasses RLS; security therefore depends on keeping credentials server-side and enforcing owner scope in the trusted API.
- Review cascade-delete behavior and audit-retention requirements before production.

## Required test matrix

| Test | Expected result |
|---|---|
| Two concurrent claims for one grant | Exactly one returns a claim |
| Replay same digest | No second claim |
| Expired grant | No claim |
| Consumed grant | No claim |
| Wrong owner | No claim; no data disclosure |
| Stale task version | No claim |
| Changed payload hash | No claim |
| Agent/capability version mismatch | No claim |
| Invalid digest length | Rejected |
| Lease duration outside 30–900 seconds | Rejected |
| Event insert failure | Entire transaction rolls back |
| Task update conflict | Grant consumption rolls back |
| Stale worker completion | Rejected by future lease-fenced completion RPC |
| Browser role calls claim RPC | Permission denied |

## Required next steps

1. Reconcile the approval service and adapter to pass a one-time token digest and verified owner context.
2. Add disposable PostgreSQL integration tests and verify SQL syntax and transaction semantics.
3. Design task creation and approval issuance with idempotency.
4. Design lease-fenced completion, failure, cancellation and renewal operations.
5. Run security review for role grants, schema exposure, owner isolation and key handling.
6. Obtain explicit approval for the exact SQL and target project before applying any migration.

## Explicit non-actions

No database writes, migrations, function deployment, secrets access, billing changes, project/branch creation, production execution or public deployment occurred.
