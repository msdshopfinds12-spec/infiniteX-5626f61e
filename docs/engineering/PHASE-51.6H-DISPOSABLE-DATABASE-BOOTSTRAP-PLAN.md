# Phase 51.6H — Disposable Database Bootstrap Plan

**Status:** PLAN COMPLETE — EXECUTION BLOCKED ON VERIFIED LOCAL TOOLCHAIN / ISOLATED DATABASE  
**Date:** 2026-11-20  
**Related:** PR #69 (workflow persistence design), PR #54 (migration recovery)

## 1. Purpose

Establish a reproducible, zero-production-risk path to verify the 19 ledger-recovered migration statements before designing or applying any new workflow-attempt schema.

This phase does not create a production migration, link a Supabase project, start a paid service, or connect to Ashaa-INX.

## 2. Source-of-truth boundaries

| Artifact set | Meaning | Permitted in baseline replay |
|---|---|---|
| 19 files listed in `MIGRATION-LEDGER-RECOVERY-MANIFEST.json` | Exact SQL statement payloads recovered from applied migration ledger | YES, disposable DB only |
| `20261120120000_harden_platform_api_key_column_access.sql` | Separate proposed privilege change | NO |
| `20261120000000_phase_4n8b_transactional_step_fencing.sql` | Separate un-applied candidate on audit branch | NO |
| Any reconstructed bootstrap/config SQL | New helper artifact, not historical migration | Only if explicitly labeled and separately reviewed |

The 19 recovered files have reported 19/19 exact string matches against the migration-ledger statement payloads. Original historical Git blob equivalence remains NOT_VERIFIED. The ledger contains no rollback SQL bodies.

## 3. New offline integrity control

PR #54 adds `scripts/verify-recovered-migration-manifest.mjs` and invokes it from the offline database-contract workflow.

The verifier:
- reads only the checked-in manifest and migration files;
- requires exactly 19 manifest records;
- validates unique 14-digit versions and unique safe paths under `supabase/migrations/`;
- verifies filename/version identity;
- recomputes SHA-256 from file bytes;
- checks the recorded one-statement / no-rollback provenance flags;
- performs no network or database operation.

Expected command from the recovery branch root:

```bash
node --check scripts/verify-recovered-migration-manifest.mjs
node scripts/verify-recovered-migration-manifest.mjs
```

Expected result after actual execution: 19 PASS lines and a final 19/19 summary. Until the corresponding GitHub Actions run completes, runtime status remains NOT VERIFIED. SHA-256 agreement proves byte integrity against the checked-in manifest, not historical Git equivalence or database parity.

## 4. Bootstrap decision

**Preferred:** official local Supabase stack with a pinned CLI version and verified support for the required extensions/services.

**Fallback:** PostgreSQL 17 disposable instance with explicitly declared compatibility fixtures. The report must say PARTIAL COMPATIBILITY REHEARSAL, never full Supabase parity.

Do not author `supabase/config.toml` by guessing version-sensitive settings. First inspect the installed CLI version and `supabase --help`, then consult current Supabase CLI documentation for the exact configuration schema. If the execution environment cannot run Docker/containers, record the bootstrap as BLOCKED and continue with static contract review rather than claiming replay.

## 5. Dependency and side-effect controls

The recovered SQL references:
- Supabase Auth objects (`auth.users`, `auth.uid()`);
- `private` schema;
- pg_cron (`cron.job`, schedule/unschedule);
- pg_net (`net.http_post`);
- Supabase Vault (`vault.secrets`, `vault.decrypted_secrets`, `vault.create_secret`);
- PostgreSQL roles, grants, function ownership and SECURITY DEFINER boundaries;
- a literal historical Supabase project URL in a cron-worker migration.

Replay controls:
1. Use a newly created disposable database with a unique local-only connection string.
2. Do not use production credentials, copied Vault secrets, or the Ashaa-INX project URL for network calls.
3. Prevent outbound HTTP and cron worker dispatch; create required catalog objects only through the official local stack or explicitly labeled test fixtures.
4. Never run the recovered chain against the live project.
5. Do not apply the API-key privilege proposal or Phase 4N.8B candidate in Pass A.
6. Preserve command output, CLI/server versions, migration hashes, and catalog snapshot.
7. Destroy only the disposable environment after artifacts are captured; never run broad cleanup commands against an unverified connection target.

## 6. Two-pass execution plan

### Pass A — recovered baseline

1. Verify 19 manifest checksums.
2. Verify the manifest's ordered versions and filenames.
3. Start the pinned local Supabase stack if supported, otherwise the explicitly labeled PostgreSQL 17 fallback.
4. Apply exactly the 19 manifest-listed migrations in order.
5. Capture schema/catalog metadata without application rows or secrets.
6. Compare against the sanitized live catalog capture using MATCH / DRIFT / NOT CAPTURED / NOT TESTED.
7. Record all shimmed or unsupported Supabase capabilities.

### Pass B — isolated candidate

Only after Pass A is reproducible:
1. Create a second disposable database from the verified baseline.
2. Review the Phase 4N.8B migration from its own branch and confirm its exact source/compatibility.
3. Apply the candidate only to this second database.
4. Run independent-session race, stale-worker, rollback, retry, cancellation, and owner-isolation tests.
5. Capture before/after catalog diff and test output.

## 7. Hard stop conditions

Stop and report BLOCKED if:
- Docker/local database capability is unavailable;
- the manifest verifier fails;
- migration order or checksum differs;
- any recovered SQL unexpectedly attempts outbound network/provider activity;
- required Supabase-managed objects cannot be reproduced honestly;
- the connection target cannot be proven disposable;
- a test requires production secrets or production writes.

No automatic fallback may silently create fake Auth/Vault/cron/net behavior and claim parity.

## 8. Acceptance matrix

| Gate | Current status |
|---|---|
| 19 recovered ledger payloads identified | VERIFIED BY PR #54 RECOVERY REPORT |
| Independent SHA-256 verifier committed | VERIFIED IN SOURCE |
| New verifier CI execution on latest PR #54 head | PENDING |
| Supabase CLI installed/version pinned | NOT VERIFIED |
| Docker/container runtime available | NOT VERIFIED |
| Local Supabase configuration validated against installed CLI docs | NOT TESTED |
| Pass A disposable replay | NOT TESTED |
| Catalog parity | NOT TESTED |
| Pass B fencing candidate | NOT TESTED |
| Production migration / grants / RLS / deployment | NOT AUTHORIZED |

## 9. Safety and release

This phase is planning plus offline source changes only. It does not authorize schema changes, production SQL, privilege changes, secret access, deployment, merge, or release. PRs #54 and #69 remain Draft and unmerged.
