# Phase 52.1B — Disposable PostgreSQL security behavior tests

## Objective

Move selected database security claims beyond SQL-text matching by executing the repository's actual API-key, webhook, and workflow-claim migrations against a disposable PostgreSQL 17 service in GitHub Actions.

## Safety boundary

- CI creates a new ephemeral PostgreSQL service and synthetic Supabase-like roles/tables.
- The test harness applies the checked-in migration files only inside that disposable service.
- The SQL test runs inside a transaction and ends with ROLLBACK.
- No Supabase project URL, production database password, service-role secret, Vault secret, or live user data is used.
- No production migration is applied and no deployment is requested.
- The API-key hardening migration remains classified as a repository candidate, not as live-applied.

## Runtime coverage

1. **API-key column privileges**
   - authenticated can select explicitly allowed metadata.
   - authenticated cannot select key_hash.
   - authenticated can update only revoked_at, not label or owner_id.
   - anon has no API-key table access.
2. **Tenant isolation**
   - Synthetic user A sees only A's API-key row.
   - Synthetic user B sees only B's API-key row.
   - User B cannot update user A's key.
3. **Webhook isolation**
   - anon and authenticated cannot select or insert into billing_webhook_events.
   - service_role retains the intended internal access.
4. **Workflow claim functions**
   - The authenticated wrapper is executable by authenticated, not anon.
   - The internal cross-owner worker function is executable by service_role, not authenticated.
   - The user-scoped claim function changes only the caller's queued workflow.
5. **SECURITY DEFINER hardening**
   - Every SECURITY DEFINER function created by the exercised migrations must carry the fixed empty search_path setting.
   - The public wrapper remains SECURITY INVOKER.

## CI architecture

- postgresql-security-behavior starts postgres:17 with a dedicated disposable database.
- psql -X -v ON_ERROR_STOP=1 executes tests/database/phase-52-1b-postgres-security.sql.
- A Node regression test checks that the harness includes the intended migration inputs, assertions, rollback, and workflow wiring.
- Existing offline provenance, migration integrity, and schema-contract gates remain unchanged.

## Limitations / next evidence required

- This is a focused PostgreSQL behavior suite, not a full Supabase Auth/PostgREST integration test.
- The synthetic auth.uid() helper models the JWT subject setting; it does not prove Supabase token validation or session lifecycle.
- The webhook table currently has no browser grants; the test verifies denial rather than asserting a row-level tenant policy that does not exist.
- The workflow-claim functions are tested with a minimal compatible workflow_runs fixture, not the entire application schema.
- A passing disposable test does not prove the candidate migration is applied to any hosted project.
- The v1 database-contract snapshot remains a separate merge blocker. Do not fabricate or manually promote it to v2.

## Acceptance criteria

- GitHub Actions runs the disposable PostgreSQL 17 security behavior job.
- The exact checked-in migration files are exercised in the disposable database.
- Any unexpected grant, cross-tenant row access, unauthorized update, function execution, or missing fixed search_path fails the job.
- The test transaction rolls back all fixture changes.
- Production safety and migration provenance controls remain intact.
