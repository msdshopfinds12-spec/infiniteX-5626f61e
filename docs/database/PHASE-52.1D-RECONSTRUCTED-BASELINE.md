# Phase 52.1D — Reconstructed workflow baseline for disposable replay

## Status

- Classification: RECONSTRUCTED_DISPOSABLE_FIXTURE
- Canonical: false
- Live parity: NOT_VERIFIED
- Production approval: NOT_GRANTED
- Scope: disposable PostgreSQL rehearsal only

## Why this exists

Phase 52.1C replayed the first four recovered migrations and stopped at migration 5 because public.workflow_runs did not exist. Historical branches contain a metadata artifact with all five workflow tables, but no original CREATE TABLE migration source was recovered.

This phase creates an explicitly reconstructed baseline from that metadata so later migration behavior can be exercised in a disposable database. It does not repair or rewrite historical migration provenance.

## Evidence source

- Artifact: docs/database/live-schema-metadata.snapshot.json
- Git blob SHA: f67a81de26ebf2ba9b3de0340663379bd550af82
- Capture timestamp: 2026-11-20T02:07:20.142926+00:00
- Reported PostgreSQL version: 17.11
- Scope: read-only public-schema catalog metadata
- Source disclaimer: metadata inventory only; not a pg_dump, bootstrap schema, replayable migration chain, or production approval.

## Reconstructed objects

- public.workflows
- public.workflow_steps
- public.workflow_runs
- public.workflow_step_runs
- public.workflow_logs

The fixture reconstructs columns, constraints, selected baseline indexes, RLS enablement, and owner-scoped policies. It intentionally omits objects explicitly introduced by later recovered migrations: scheduled_for and its unique index, plus four worker-support indexes.

## Replay position

The runner applies the fixture after recovered migrations 1–4 and before recovered migration 5. This position is chosen because migration 5 explicitly alters workflow_runs and reads workflows.

## What this does NOT prove

- It does not prove that the fixture is byte-identical to the original historical schema.
- It does not prove live database parity.
- It does not replace the 19 recovered ledger statements or alter their hashes.
- It does not authorize candidate migration application to production.
- It does not establish trigger, grant, extension, Vault, cron, or pg_net parity beyond what subsequent migration execution itself demonstrates.
- It must never be used as a hosted Supabase migration.

## Acceptance criteria

1. The fixture is labelled reconstructed and noncanonical in SQL, JSON, and documentation.
2. The fixture runs only in the disposable rehearsal between recovered migrations 1–4 and 5–19.
3. The runner validates the fixture source marker and required object list before execution.
4. Candidate migration remains separate and is skipped if historical replay is blocked or fails.
5. Existing v1 contract merge gate remains fail-closed.


## Disposable cryptographic prerequisite

The rehearsal uses the Supabase PostgreSQL image's supported `pgsodium.getkey_script` and `vault.getkey_script` settings, pointing to its bundled `/usr/lib/postgresql/bin/pgsodium_getkey.sh`. The bundled script creates a fresh root-key file inside the disposable container when one is absent. The key is not stored in repository files or GitHub secrets, is not reused, and is not a production key. The container is removed after the job.
