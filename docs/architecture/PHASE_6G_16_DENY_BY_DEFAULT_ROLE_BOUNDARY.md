# Phase 6G.16 — Deny-by-default role boundary

Status: IMPLEMENTED ON FEATURE BRANCH — CI VERIFICATION PENDING

## Changes
- \`tests/postgres/security_roles.sql\`: creates three NOLOGIN runtime roles, revokes PUBLIC and role privileges, and verifies direct table reads/writes and lifecycle function execution are denied.
- \`tests/postgres/run.sh\`: runs role-boundary assertions after lifecycle and race contracts.
- \`tests/postgres/README.md\`: documents the security boundary and limitations.

## Verified design intent
The current database harness does not have a trusted principal mapping or verified tenant RLS. Therefore the safest correct policy is no runtime grants. This prevents the test roles from reading task/approval data, mutating task events, or invoking functions that trust owner/worker parameters.

## Not implemented or verified
- Authenticated user or worker identity binding.
- Tenant RLS or cross-tenant policy correctness.
- Production database role mapping.
- Production driver or adapter integration.
- Production readiness.

These tests use disposable NOLOGIN roles and are not production migrations. Do not grant these roles to real users or services.
