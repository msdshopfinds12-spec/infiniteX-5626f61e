# Phase 52.1C — Disposable migration-chain rehearsal

## Purpose

Rehearse the recovered migration history in timestamp order on an isolated Supabase PostgreSQL 17 container, then execute any proposed candidate migration only after the recovered history succeeds.

## Verified repository facts

- The recovery manifest classifies 19 migration statements as ledger-recovered applied entries.
- The provenance classification separately lists one API-key hardening candidate as PROPOSED_NOT_APPLIED / NOT_VERIFIED_LIVE / NOT_GRANTED.
- The first core-schema migration creates profiles, tools, user_projects, usage_logs, subscriptions, and payments.
- The later scheduler migration alters public.workflow_runs and reads public.workflows.
- None of the 19 recovered migration files is a baseline migration that creates the workflow domain tables (workflows, workflow_runs, workflow_steps, workflow_step_runs, workflow_logs).

## Safety model

- CI uses the pinned Supabase PostgreSQL 17 container only; it does not use the Supabase project ref, URL, credentials, or connected database.
- The bootstrap creates only platform prerequisites (synthetic roles, auth schema, synthetic auth.users, and auth.uid()).
- It deliberately does not invent application workflow tables or seed hidden application state.
- pg_cron is configured with cron.launch_active_jobs=off. The migration chain may register cron metadata, but scheduled jobs are not allowed to run.
- No production credentials or real Vault secrets are supplied.
- The candidate migration is never treated as applied history and is executed only after all 19 recovered entries succeed in the disposable database.
- No merge, hosted migration, deployment, billing, or production mutation is performed.

## Rehearsal behavior

1. Validate the 19-entry recovery manifest and separate candidate classification.
2. Verify each SQL file SHA-256 against its provenance record.
3. Bootstrap platform prerequisites in a fresh disposable database.
4. Apply the 19 recovered SQL files in timestamp order, stopping at the first SQL error.
5. Classify missing baseline relations/schemas/roles/extensions as BLOCKED, not as a false syntax defect.
6. Classify unexpected SQL errors as FAIL.
7. Only after all recovered entries pass, apply the candidate migration as a separate disposable-only step.
8. Emit a machine-readable JSON report and a GitHub Actions summary.

## Known blocker before runtime

The recovered migration set is not demonstrably self-contained: the initial core migration does not create the workflow tables required by subsequent scheduler/worker migrations. The rehearsal must not fabricate those tables to make the chain appear complete. If no authoritative baseline source is present in the repository, the expected outcome is BLOCKED at the first missing workflow relation. Recover the real schema source or a reviewed baseline before attempting a complete replay.

## Acceptance criteria

- The rehearsal runs only against the ephemeral Supabase PostgreSQL 17 container.
- The 19 recovered entries and candidate remain separately classified.
- SQL execution stops at the first missing prerequisite or unexpected failure.
- Missing authoritative baseline is reported as BLOCKED with the exact migration and PostgreSQL error.
- Candidate execution is skipped whenever the recovered history is blocked or fails.
- CI records a structured report and retains all existing fail-closed contract gates.
