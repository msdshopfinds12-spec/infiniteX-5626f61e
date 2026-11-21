# Phase 97 — Database Security Catalog Audit

**Base:** `c0b0d731be540a448e96e1632bb31437fa6f994f` (Phase 96)
**Branch:** `phase-97-database-security-audit`
**Scope:** Read-only PostgreSQL catalog assertions in disposable CI.
**Production migration / deployment / merge:** NOT PERFORMED

## Objective

Turn the repository's database security assumptions into executable checks against the exact migration chain replayed in disposable PostgreSQL 17.

## Assertions

1. RLS is enabled on all five workflow tables: workflows, workflow_steps, workflow_runs, workflow_step_runs and workflow_logs.
2. Authenticated table privileges match the intended contract:
   - workflows and workflow_steps: SELECT / INSERT / UPDATE / DELETE
   - workflow_runs: SELECT / INSERT only
   - workflow_step_runs and workflow_logs: SELECT only
   - anon: no table-level access to these workflow tables.
3. Owner policies exist and bind row access to `auth.uid()`, including workflow/step management, run visibility/creation, step-run reads and log reads.
4. Every SECURITY DEFINER function in the public/private application schemas pins an empty search_path.
5. Browser enqueue is authenticated-only; cross-owner internal worker claim is service-role-only; the public claim wrapper is authenticated and owner-scoped.
6. The private transactional outbox table is inaccessible to anon/authenticated and available to service_role.
7. Outbox claim/finish/simulation RPCs are service-role-only.

## Execution

The new `tests/database/phase-97-database-security-audit.sql` is run after the migration rehearsal and synthetic fixture seeding in the Phase 84/94/97 disposable PostgreSQL integration workflow.

The SQL file refuses to run unless `current_database() = 'infinitex_rehearsal'`. It performs catalog and privilege assertions inside a transaction and rolls back. It does not modify schema or fixture data.

## Audit harness correction

The first disposable PostgreSQL execution correctly stopped at the policy-expression assertion. Catalog output showed PostgreSQL deparses the repository's `auth.uid()` policy expression as `uid()` in `pg_policies.qual` because the function is schema-resolved in the policy expression. The initial assertion incorrectly required the literal text `auth.uid`; this was a test-harness false negative, not evidence of a tenant-isolation defect. The assertion now checks the deparsed `uid()` call while retaining exact policy, command, role, USING and WITH CHECK checks. The temporary diagnostic query was removed after identifying the mismatch.

## Existing defense-in-depth

Phase 82 separately exercises two-tenant PostgREST behavior, including owner isolation, cross-tenant update denial, forged owner insert rejection and API-key hash confidentiality. Phase 94 verifies the authenticated enqueue-to-worker lifecycle and owner-authorized history read. Phase 97 complements those runtime checks with direct catalog assertions.

## Alternatives considered

- **Catalog assertions in PostgreSQL:** selected because it validates effective grants, RLS flags, policy metadata and function ACLs against the replayed database.
- **Static SQL regex checks only:** insufficient; text can look secure while effective grants differ.
- **Hosted production advisor or live queries:** intentionally excluded because production credentials and live database changes are not authorized.
- **Policy-only checks:** insufficient without table grants and SECURITY DEFINER execution checks.
- **Full production migration application:** rejected; candidate migrations remain separately classified and not production-approved.

## Limitations

- This verifies the reconstructed disposable baseline and the repository's recovered/candidate migration replay, not the hosted Supabase project's actual catalog.
- RLS policy metadata assertions complement but do not replace behavioral tenant-isolation tests.
- The audit does not prove production secrets, Edge Function configuration, network policy, backups, monitoring, or Vercel deployment parity.
- It does not certify the application as unbreakable or guarantee absence of unknown vulnerabilities.

## Release boundary

No live database query, production migration, Edge Function deployment, secret change, billing operation, public release or PR merge is performed by this phase.

**Status before CI:** IMPLEMENTED / NOT YET VERIFIED.
**Release status:** NOT APPROVED.
