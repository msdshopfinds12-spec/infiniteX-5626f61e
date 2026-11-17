# Phase 4M.3 — Tenant Isolation and Queue Reliability Test Plan

**Status:** Source-level regression contracts added; database integration and concurrency verification remain NOT TESTED.

## Scope
This phase introduces regression tripwires for security invariants in the two workflow Edge Functions. The tests inspect the checked-in worker source and verify that critical ownership and authorization guards remain present.

## Source-level contracts
- The authenticated worker derives `ownerId` from a verified Supabase session, not from request JSON.
- Claimed user runs must match that authenticated owner.
- The parent workflow lookup must match both workflow ID and owner ID.
- Step-run lookups must include run ID, step ID and owner ID.
- The cron worker must verify the server-side worker secret before calling the internal queue-claim RPC.
- Cron claims must have a valid shape and their parent workflow must match the claimed owner.
- Cron step-run lookups must include the claimed owner.

Run locally with `npm test`; CI already runs the repository's Node test suite.

## Important limitation
These are source-level regression tests. They do **not** execute PostgreSQL RLS, Supabase RPCs, transaction locks, concurrent claims, or real two-user sessions. A passing source-contract test is not proof of tenant isolation in the live database.

## Required database integration suite
Before marking tenant isolation VERIFIED, create an isolated disposable Supabase/PostgreSQL test environment with synthetic identities only:
1. Create synthetic tenant A and tenant B.
2. Create one workflow and queued run per tenant.
3. Authenticate as tenant A and assert tenant B rows are not readable, mutable, or claimable.
4. Repeat as tenant B.
5. Attempt cross-tenant run IDs, workflow IDs, step IDs and malformed claims.
6. Assert every unauthorized read/write/claim fails closed.
7. Repeat tests using the same RPC grants as production roles; never use production credentials.
8. Capture database version, migration set, test commit SHA and full test output.

## Queue concurrency and idempotency acceptance
- Launch multiple independent claim transactions concurrently against the isolated database.
- Assert no run is simultaneously returned to two claimers.
- Assert each run/step idempotency key produces at most one durable effect.
- Simulate worker interruption after claim, during a step and before final acknowledgement.
- Verify lease expiry/stale-run recovery does not overwrite a newer active claim.
- Verify retry limits, attempt counters, terminal states and event logs.
- Run repeated tests to expose timing-sensitive races.

## Preconditions / safety
- Recover authoritative SQL bodies for the applied migration ledger before attempting to reproduce the production schema.
- Do not infer or fabricate migration SQL from metadata.
- Do not point tests at production. Do not change production RLS, grants, secrets, worker schedules or deployed functions during this phase.
- Any temporary database, paid resource, billing change, migration, or destructive reset requires explicit approval.

## Evidence gate
A test report must include the exact commit SHA, isolated database identity (non-secret), migration checksums, synthetic test identities, commands, pass/fail counts and logs. Without this evidence, tenant isolation and queue concurrency remain NOT VERIFIED.
