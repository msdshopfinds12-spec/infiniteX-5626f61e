# Phase 4M.2B — Edge Function Hardening

**Status:** proposed repository source snapshot; not deployed.  
**Source provenance:** read-only source retrieval from Supabase project `Ashaa-INX` (`vepacoemkhudamfaccah`) on 2026-11-18.  
**Scope:** GitHub branch only. No function deployment, SQL, migration, secret read, or project configuration change.

## Proposed changes

- Authenticated workflow worker rejects malformed or cross-owner claimed runs before service-role processing.
- It verifies the parent workflow is owned by the authenticated user before reading workflow steps.
- Cron worker rejects malformed queue claim records; its existing parent-workflow owner predicate and worker-secret validation are preserved.
- Browser-facing workflow and API-key functions use a shared exact-origin CORS helper instead of wildcard CORS.
- `INFINITEX_ALLOWED_ORIGINS` is a comma-separated exact-origin allowlist. Empty/unset configuration denies browser-origin requests. Requests without an Origin header remain usable for server-to-server calls.

## Configuration gate

Do not deploy until actual approved InfiniteX production and preview origins are confirmed and configured. No domain is assumed or invented here. CORS is not authentication or authorization.

## Remaining verification

- Deno type-check and unit tests.
- Cross-user negative tests for mismatched claimed-run owner and mismatched parent workflow.
- Verify the claim RPC's implementation, execute grants, and all table grants.
- Verify schema constraints and unique keys used by upserts.
- Verify exact browser origins and preflight behavior.
- Review source drift against the deployed function before any deployment.

No webhook receiver is invented. No schema, RLS, grants, secrets, billing, deployment, merge, or production data changes are included.
