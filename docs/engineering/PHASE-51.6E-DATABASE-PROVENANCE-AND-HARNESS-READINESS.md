# Phase 51.6E — Database Provenance and Harness Readiness Gate

**Status:** PARTIALLY UNBLOCKED — migration ledger statements recovered; clean-room replay and catalog parity remain unverified  
**Inspection date:** 2026-11-20  
**Phase 51 parent:** `feat/phase-51-durable-workflow-engine`  
**Design PR:** #69  
**Database recovery PR:** #54 — `recovery/infinitex-database-source-of-truth`  
**Recovery head inspected:** `ec225c190db285210176574fd558f99b616d768f`

## 1. Corrected repository finding

The initial Phase 51 parent-branch inventory remains accurate: that branch has `supabase/functions/` but no `supabase/migrations/` directory.

A cross-branch investigation then located the dedicated database recovery workstream in PR #54. Its branch contains a `supabase/migrations/` directory and a migration-ledger recovery manifest. Therefore, the repository-wide statement that migration SQL is unavailable is no longer correct.

### Recovered migration evidence

PR #54 records a read-only extraction from `supabase_migrations.schema_migrations.statements` in the Ashaa-INX project (PostgreSQL 17.11):

- 19 applied migration ledger records were observed.
- All 19 records contained one non-empty stored SQL statement payload.
- 19 versioned SQL files were restored on the recovery branch.
- The recovery report states that all 19 GitHub file contents were independently compared with the corresponding ledger statement strings: **19/19 exact string matches**.
- SHA-256 values are recorded in `docs/database/MIGRATION-LEDGER-RECOVERY-MANIFEST.json`.
- `original_git_blob_equivalence` remains `NOT_VERIFIED`: these are ledger-recovered applied statements, not proven byte-identical historical source-control files.
- The ledger did not contain rollback SQL bodies.

See:
- PR #54: https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/pull/54
- `docs/database/MIGRATION-RECOVERY.md`
- `docs/database/MIGRATION-LEDGER-RECOVERY-MANIFEST.json`
- `docs/database/PHASE-4N20-LIVE-LEDGER-RECOVERY.md`
- `docs/database/PHASE-4N21-CATALOG-CONTRACT-CAPTURE.md`

These are meaningful source-recovery evidence, but not yet a verified clean-room database bootstrap or proof of complete live schema parity.

## 2. Separate candidate migrations — do not conflate with applied history

Two candidate migrations must remain separate from the 19 recovered applied ledger statements:

1. `20261120000000_phase_4n8b_transactional_step_fencing.sql` is a candidate migration. The recovery report states its version is absent from the live applied ledger and `public.simula_transition_workflow_step` is absent from the live public function catalog. It is not deployed.
2. `20261120120000_harden_platform_api_key_column_access.sql` is an additional proposed least-privilege change in PR #54. It is not one of the 19 recovered applied ledger entries. Its SQL revokes authenticated table-level SELECT and grants selected metadata columns, while keeping `key_hash` server-only. Treat it as a separately reviewed proposal, not historical migration.

Do not apply either candidate as part of a recovered-history replay. Review their exact catalog effects, dependencies, PostgREST behavior, and rollback/recovery strategy independently.

## 3. Live catalog evidence and limitations

PR #54 includes a sanitized read-only catalog capture and reports:
- 14 public application tables, all with RLS enabled.
- 219 table-grant rows, six non-internal triggers, ten public/private function overloads, and seven installed extensions captured.
- PostgreSQL 17.11.
- `public.billing_webhook_events` has RLS enabled with zero policies and observed grants limited to postgres/service_role; intent still requires review.
- Authenticated had SELECT privilege on `public.platform_api_keys.key_hash`; this is a least-privilege concern, not an already-applied fix.
- The snapshot is explicitly `PENDING_HUMAN_REVIEW`; some column/constraint/index/policy definitions reuse an earlier capture. It is not a complete pg_dump, canonical bootstrap, or approved desired-state contract.

The live catalog evidence says the Phase 4N.8B RPC is absent. The candidate migration and worker sources must not be treated as deployed.

## 4. Existing PostgreSQL 17 synthetic contract harness

A separate branch, `audit/phase-4n8b-live-schema-preflight`, already contains:
- PostgreSQL 17 GitHub Actions service workflow.
- A synthetic contract fixture.
- A shell runner that refuses any database URL except the exact disposable localhost service URL.
- Independent PostgreSQL sessions that synchronize on an observed row-lock wait.
- Tests for same-generation duplicate start rejection, stale completion rejection, transaction rollback, and generation-2 success.
- Explicit output labeling the result as synthetic contract testing, not production schema validation.

This harness is valuable as a narrow concurrency-contract test. It is not a replay of the 19 recovered migrations and does not prove production RLS/grant/RPC parity. Do not duplicate or silently transplant it without checking branch ancestry and exact source.

Related branch: `audit/phase-4n8b-live-schema-preflight`  
Related implementation PR: #35 (older, Draft, unmerged, and based on a separate feature branch).

## 4.1 Local Supabase bootstrap prerequisite

A follow-up tree inspection of PR #54's recovery head found 20 SQL files under `supabase/migrations/`: 19 ledger-recovered applied statements plus the separate proposed API-key column-grant migration. The Phase 4N.8B fencing candidate is on the separate audit branch, not part of those 20 files.

The recovery branch does **not** currently contain `supabase/config.toml` or `supabase/seed.sql`. Therefore the presence of recovered SQL files does not yet make the branch a runnable Supabase CLI project. Before claiming clean-room replay readiness:
- inventory every migration's extension, role, schema, auth, Vault, pg_cron, pg_net, and environment-specific dependencies;
- decide which dependencies are provided by the official local Supabase stack and which require explicit, isolated compatibility setup;
- create and review a local-only Supabase configuration, if needed, without production project identifiers or secrets;
- exclude the un-applied API-key proposal from the historical 19-migration replay;
- run the 19 recovered statements in an empty disposable environment and preserve logs/catalog output.

Do not create a fake `auth`, `vault`, `cron`, or `net` implementation and call it full Supabase parity. Any compatibility shim must be named, documented, and reflected in the result classification.

## 5. Current CI evidence for recovery PR #54

At inspected head `ec225c190db285210176574fd558f99b616d768f`, GitHub returned workflow run #44677412455.

Observed jobs:
- Offline migration/contract job: final conclusion FAILURE because the explicit merge-blocking source-readiness step failed.
- JavaScript syntax checks: PASS.
- Database contract validator regression tests: PASS.
- API-key column privilege regression tests: PASS.
- Migration integrity regression tests: PASS.
- Migration naming/content integrity: PASS.
- Contract snapshot structural validation: PASS.
- Production safety invariant: PASS.
- Final merge gate: BLOCKED/FAIL because the snapshot remains pending explicit human approval.

Do not describe the entire workflow as green. The validator and regression steps passed; the final merge gate is intentionally closed until a reviewer approves the snapshot. This approval is a governance gate, not permission to mutate production.

## 6. Corrected harness strategy

**Preferred path:** use the 19 ledger-recovered SQL files as the input to a clean-room PostgreSQL 17/Supabase rehearsal, but only after reviewing migration environment dependencies and local bootstrap prerequisites.

Required steps:
1. Independently verify the 19 manifest SHA-256 values against the checked-in file bytes and preserve the exact manifest.
2. Confirm migration filenames, ordering, and statement contents correspond one-to-one with the 19 live ledger versions.
3. Identify dependencies on Supabase-managed schemas, roles, auth functions, Vault, pg_cron, pg_net, and extensions. Use a local Supabase stack where feasible; do not fake these objects without explicit stubs and limitation labels.
4. Apply the recovered statements only to a newly created disposable database, never to the source production project.
5. Capture the rehearsal catalog and compare tables, columns, types, defaults, constraints, indexes, functions, owners, SECURITY DEFINER/search_path, grants, RLS policies, triggers, and extensions against the sanitized live snapshot.
6. Report each mismatch as MATCH / DRIFT / NOT CAPTURED / NOT TESTED. Do not turn missing snapshot fields into assumed parity.
7. Keep the synthetic Phase 4N.8B harness as a separate focused race test.
8. Only after baseline replay is reproducible, layer the Phase 4N.8B candidate migration into a second disposable database and run concurrency tests.
9. Separately review the proposed API-key column privilege migration; do not include it in the historical replay.
10. Resolve Phase 51.6D logical-attempt design against the old run-generation fencing model before designing new attempt-ledger DDL. Run claim generation, logical step attempt number, delivery count, and lease generation must remain distinct.

**Alternative if local Supabase cannot run:** use a disposable PostgreSQL 17 container with an explicitly documented compatibility shim for Supabase-managed roles/functions/extensions. Label results as partial compatibility rehearsal; never claim full Supabase parity.

## 7. Gate status

| Gate | Status | Evidence / next action |
|---|---|---|
| Phase 51 branch migration directory | NOT PRESENT | Initial finding remains branch-specific |
| Cross-branch migration recovery | VERIFIED BY PR #54 REPORT | 19/19 ledger payload exact string matches reported |
| Original historical Git blob equivalence | NOT VERIFIED | Search original refs/backups; keep distinction |
| Recovered migration checksums | MANIFESTED | Independently recompute against file bytes |
| Supabase CLI config/seed bootstrap | NOT PRESENT | Recovery branch lacks `supabase/config.toml` and `supabase/seed.sql` |
| Live catalog capture | AVAILABLE, PARTIAL | Sanitized snapshot; pending human review |
| PR #54 offline validator/regression tests | PASS | Run #44677412455 individual steps |
| PR #54 overall merge gate | BLOCKED | Explicit snapshot approval pending |
| PostgreSQL 17 synthetic race harness | EXISTS ON OTHER BRANCH | Narrow contract only; verify exact-head CI before reuse |
| Clean replay of 19 recovered statements | NOT TESTED | Build disposable local rehearsal |
| Rehearsal-vs-live catalog parity | NOT TESTED | Complete definition-by-definition comparison |
| Phase 4N.8B candidate RPC deployed | ABSENT per recovery report | Separate candidate review |
| Phase 51 durable attempt ledger | NOT IMPLEMENTED | Resolve contract and test on replayed baseline |
| Production schema replay or migration | NOT AUTHORIZED | Separate human approval required |

## 8. Safety boundary

No production DDL/DML, migration application, grants/revokes, RLS change, RPC call, secret change, deployment, merge, or release is performed by this phase. Historical recovery artifacts are evidence inputs only. All replay and concurrency work must target a newly created disposable environment.
