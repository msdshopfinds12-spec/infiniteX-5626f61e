# Phase 51.6E — Database Provenance and Harness Readiness Gate

**Status:** BLOCKED FOR PRODUCTION-SCHEMA REPLAY — repository inventory only  
**Inspection date:** 2026-11-20  
**Branch inspected:** `feat/phase-51-durable-workflow-engine`  
**PR context:** stacked under PR #63; design review in PR #69

## 1. Repository evidence

The GitHub Contents API listing of the Phase 51 parent branch root contains a `supabase/` directory. Listing `supabase/` shows only `functions/`; no `supabase/migrations/` directory is present in that branch.

The inspected worker entrypoints are:
- `supabase/functions/simula-workflow-worker/index.ts`
- `supabase/functions/simula-workflow-cron-worker/index.ts`

The repository contains live-schema verification documents:
- `docs/engineering/PHASE-51.1-DATABASE-CONTRACT-VERIFICATION.md`
- `docs/engineering/INFINITEX-LIVE-SCHEMA-RLS-BASELINE-2026-11-20.md`
- `docs/engineering/PHASE-51-EXISTING-WORKFLOW-CONTRACT-INVENTORY.md`

These documents report read-only catalog inspection of the deployed Supabase project. They are evidence summaries, not executable migration history.

## 2. Consequence

A GitHub Actions PostgreSQL service can safely test an isolated synthetic schema, but it cannot truthfully claim to replay or validate the deployed Supabase schema when the authoritative migration chain is not present in the inspected branch.

Do not create a synthetic schema and label it production-compatible. Do not infer missing migration DDL from catalog summaries alone. Do not use a synthetic schema test to claim production RLS, grants, SECURITY DEFINER, trigger, or RPC compatibility.

## 3. Required provenance recovery

Before a production-schema replay harness can be implemented:
1. Locate the authoritative migration repository or directory and identify the exact deployed migration version.
2. Obtain the complete ordered migration chain (including functions, triggers, indexes, constraints, grants, and RLS policies).
3. Compare migration history against the read-only catalog baseline from 2026-11-20.
4. Identify any dashboard/manual SQL changes not represented in migrations.
5. Reconcile migration history with current worker RPC names and signatures.
6. Establish a clean disposable PostgreSQL bootstrap path. Supabase-specific auth roles/functions/extensions must be represented accurately or explicitly stubbed with a documented limitation.
7. Record schema drift and decide whether the disposable environment is a faithful replay or only a contract simulation.

## 4. Safe implementation options

### Option A — preferred: recover and replay authoritative migrations

Use when the migration chain is available and can bootstrap a clean local/disposable database. This is the only path that can support a production-schema replay claim, subject to catalog comparison and Supabase-specific compatibility tests.

### Option B — contract simulation only

Use when migrations are unavailable. Build a clearly named synthetic schema under test fixtures and test only the agreed transaction invariants. Label every result **SYNTHETIC CONTRACT TEST — NOT PRODUCTION SCHEMA VALIDATION**. Do not test or claim exact production RLS/grants/RPC parity.

### Option C — Supabase local stack

Use only if the complete Supabase CLI migration/configuration setup can be restored and run in an isolated local environment. Do not connect the harness to the production project. Container requirements and local resource cost must be checked before choosing this route.

## 5. Gate status

| Gate | Status | Evidence / next action |
|---|---|---|
| Supabase functions source inventory | PARTIAL | Two workflow worker entrypoints identified |
| Supabase migration directory in inspected branch | NOT PRESENT | `supabase/` listing contains `functions/` only |
| Live schema catalog baseline | DOCUMENTED | Read-only report dated 2026-11-20 |
| Exact migration history/provenance | BLOCKED | Recover authoritative migration chain |
| Clean PostgreSQL bootstrap | NOT VERIFIED | No executable migrations found in inspected path |
| Synthetic contract test feasibility | AVAILABLE | May proceed only with explicit synthetic labeling |
| Production schema replay | BLOCKED | Requires provenance recovery and catalog reconciliation |

## 6. Next safe GitHub work

- Continue source-only inventory of all RPC callers, table access, worker transitions, and generated database types.
- Add a PostgreSQL service only after selecting Option A or explicitly approving Option B as a synthetic contract simulation.
- Keep all SQL under test fixtures until schema provenance and decisions are reviewed.
- Use independent connections for concurrency tests.
- Never pass production credentials or production Supabase URL into CI.

## 7. Safety boundary

This document is an evidence-based blocker record. It creates no SQL, migration, database object, credential, deployment, or production change. PRs remain Draft and unmerged.
