# Phase 51.6I — Recovered Migration Side-Effect Review

**Status:** STATIC INVENTORY VERIFIED BY CI — DATABASE REPLAY NOT EXECUTED  
**Date:** 2026-11-20  
**Source:** PR #54 recovery branch, 19 SQL statements listed in `MIGRATION-LEDGER-RECOVERY-MANIFEST.json`  
**Policy:** `docs/database/migration-side-effect-policy.json`  
**Scanner:** `scripts/audit-migration-side-effects.mjs`

## 1. Purpose

Identify high-impact SQL operations that can change extension state, schedule background work, call external services, or access secrets. This inventory exists to prevent an apparently local migration replay from unexpectedly dispatching cron jobs or making external HTTP calls.

The scanner is offline and read-only. It does not execute SQL, connect to Supabase, access Vault values, or make network requests.

## 2. Exact reviewed inventory

The policy pins the migration versions where these constructs are expected:

| Construct | Expected migration versions | Risk / required replay control |
|---|---|---|
| `cron.schedule` | `20261025201001`, `20261025202809` | Scheduled jobs may run independently after creation |
| `cron.unschedule` | `20261025201001` | Replaces a specifically named scheduler job |
| `net.http_post` | `20261025202809` | Can dispatch outbound HTTP to a configured endpoint |
| `vault.*` | `20261025202741`, `20261025202809` | Reads/creates secrets; never print decrypted values |
| `CREATE EXTENSION` | `20261025201001`, `20261025202536`, `20261025202644` | Depends on extension availability and schema placement |
| Literal HTTP(S) URL | `20261025202741` | Historical project URL is embedded as a Vault secret value |

This policy is an expected-version allowlist, not a declaration that these operations are safe to run in any environment.

## 3. Static guard implementation

PR #54 commit `68aa1e86ddd9c0ef1e631af061e131c47eb66abc` adds:

- `docs/database/migration-side-effect-policy.json`: reviewed version allowlist.
- `scripts/audit-migration-side-effects.mjs`: offline static scanner.
- `tests/database/migration-side-effect-audit.test.mjs`: four regression tests.
- CI integration into `.github/workflows/database-contract.yml`.

The scanner:
- reads exactly the 19 manifest-listed recovered migration files;
- strips line and block comments while preserving quoted and dollar-quoted SQL bodies;
- detects scheduler, outbound HTTP, Vault, extension DDL, and literal HTTP(S) URL constructs;
- compares exact observed migration versions with the checked-in policy;
- fails CI if a high-impact construct appears in a new migration or disappears from its expected source.

The scanner is intentionally described as static pattern matching, not a SQL parser. It can require policy review when syntax changes and cannot prove runtime behavior.

## 4. Exact CI evidence

GitHub Actions Database Contract Gate Run #39, ID `44734472926`, exact commit `68aa1e86ddd9c0ef1e631af061e131c47eb66abc`:

- JavaScript syntax checks: PASS.
- 19 recovered migration SHA-256 manifest verification: PASS.
- High-impact side-effect inventory: PASS.
- Side-effect scanner regression tests: PASS.
- Database contract validator regression tests: PASS.
- API-key column privilege regression tests: PASS.
- Migration integrity regression tests: PASS.
- Migration naming/content integrity: PASS.
- Production-safety invariant: PASS.
- Final source-readiness merge gate: BLOCKED/FAILURE because the authoritative database contract snapshot is absent or still awaiting explicit human approval.

Overall workflow conclusion is FAILURE by design while source-readiness evidence is incomplete. The side-effect scanner and offline test steps themselves passed.

## 5. Disposable replay safety requirements

Before any migration replay:
1. Use a newly provisioned disposable local Supabase environment with documented CLI/runtime versions.
2. Prove the connection target is local and disposable before running any command.
3. Prevent cron dispatch and outbound network access from the database during replay.
4. Do not reuse the historical project URL, production Vault secrets, service-role keys, or database passwords.
5. Treat scheduler and outbound HTTP jobs as inert test artifacts; do not invoke them.
6. Capture only sanitized catalog metadata, never application rows or decrypted secrets.
7. Keep the 19 recovered statements separate from the un-applied API-key privilege proposal and Phase 4N.8B candidate.

If these conditions cannot be proven, replay remains BLOCKED.

## 6. Remaining work

1. Obtain human review of the sanitized live database contract snapshot and its provenance.
2. Verify a pinned local Supabase CLI and Docker-capable disposable environment.
3. Design a no-egress/no-cron replay harness for the 19 recovered migrations.
4. Execute Pass A in the disposable environment and compare catalog metadata.
5. Only after Pass A succeeds, create a second disposable database for the separate Phase 4N.8B fencing candidate and independent-session concurrency tests.
6. Build durable attempt persistence and worker adapters only after schema and RPC contracts are reconciled.

## 7. Safety boundary

No SQL was executed. No production database, Supabase secrets, Vault values, RLS policies, grants, worker deployments, or user data were accessed or modified. No PR was merged and no deployment was performed.
