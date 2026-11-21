# Phase 102.4 — Outbox Lease Expiry Fence

Status: source changes committed to the isolated candidate branch; execution and database verification pending.

## Repository target

- Repository: `msdshopfinds12-spec/infiniteX-5626f61e`
- Branch: `phase-101-6-isolated-concurrency-hardening`
- Scope: source, regression test, and review documentation only.
- Explicit exclusions: no hosted migration, no database apply, no merge, no deployment, no provider delivery activation, and no secrets or billing changes.

## Verified source defect

The current `public.simula_finish_workflow_outbox(uuid, uuid, boolean, text)` locks the outbox row and validates processing status plus lock-token equality. It does not reject a matching token after `lease_until` has expired.

That permits a delayed worker to finalize an event after its lease deadline, provided no newer claimant has yet replaced the token. Token identity without lease validity is not a complete lease fence.

## Implemented source changes

1. Added a regression path to `tests/workers/phase-101-6-outbox-concurrency.deno.ts`:
   - Claim the event created by this test using the public claim RPC.
   - Wait for the database-issued 60-second lease to expire.
   - Attempt completion using the old token and require rejection.
   - Reclaim the event and require a different token.
   - Complete with the fresh token and require success.
   - Continue using synthetic fixture IDs and the existing disposable-database opt-in / loopback checks.
2. Added `supabase/patches/phase-102-4-outbox-expiry-guard.sql` as a review-only SQL patch outside the migration directory.
3. Updated the Phase 101.6 engineering record to describe the new invariant and verification gates.

## SQL guard design

The patch retains the existing `SECURITY DEFINER`, empty `search_path`, service-role-only EXECUTE grant, bounded error validation, and row lock.

After `SELECT ... FOR UPDATE` and after the already-succeeded idempotent replay case, it verifies:

```sql
IF v_row.status <> 'processing'
   OR v_row.lock_token IS DISTINCT FROM p_lock_token THEN
  RAISE EXCEPTION 'outbox_lease_superseded' USING ERRCODE = '40001';
END IF;

IF v_row.lease_until IS NULL
   OR v_row.lease_until <= pg_catalog.clock_timestamp() THEN
  RAISE EXCEPTION 'outbox_lease_expired' USING ERRCODE = '40001';
END IF;
```

Use `clock_timestamp()` after the row lock. `now()` / transaction timestamp can predate a lock wait and therefore does not represent current wall-clock time at the decision point.

## Why not use a shorter test lease?

The existing claim RPC owns the 60-second lease duration. Directly editing private rows from the integration test would bypass the public database contract and require a broader privilege surface. The test therefore waits for the actual lease to expire. The additional runtime cost is intentional and isolated to disposable CI.

## Verification plan

- [ ] Generate a timestamped migration using the Supabase CLI in a local/disposable project; do not hand-place the patch in the migration history.
- [ ] Apply the generated migration only to disposable PostgreSQL 17.
- [ ] Run the Phase 101.6 Deno integration test and confirm stale completion is rejected.
- [ ] Confirm the fresh claim receives a different token and can complete.
- [ ] Run existing Phase 81/87 disposable integration suites.
- [ ] Run Deno type-check and the existing Node regression suite.
- [ ] Run Supabase security/performance advisors and inspect function privileges.
- [ ] Review database logs and ensure no unexpected `outbox_lease_superseded` or `outbox_event_not_found` errors are misattributed.
- [ ] Record the exact tested commit SHA and CI run URLs.
- [ ] Obtain independent review before merge or any hosted database operation.

## Known limitations and blockers

- The SQL patch is a review artifact, not a migration. Supabase CLI migration generation and local disposable database rehearsal have not been performed in this environment.
- The new regression test is expected to fail against the unpatched function. Do not weaken the assertion to make the current implementation pass.
- The test waits for the 60-second lease and may increase integration CI duration.
- The test's claim batch is bounded at 25; the isolated disposable database should remain free of unrelated pending outbox fixtures. If that assumption fails, improve fixture isolation rather than broadening claims or deleting unrelated rows.
- This change addresses outbox lease expiry only. It does not implement run heartbeat, run lease token fencing, aggregate workflow deadlines, provider idempotency adapters, or full reconciliation.
- No test was executed as part of this source commit sequence.

## Release state

NOT READY. Keep all related PRs in draft until disposable database tests, exact-head CI, independent security review, and separate human release approval are complete.
