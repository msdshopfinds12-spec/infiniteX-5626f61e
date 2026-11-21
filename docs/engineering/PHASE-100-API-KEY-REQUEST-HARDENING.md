# Phase 100 — API Key Request Boundary Hardening

**Base:** Phase 99 exact-head SHA `98a106375596888aba01b23a8a31fe7055c9a96a`
**Branch:** `phase-100-api-key-request-hardening`
**Scope:** Strict server-side request parsing for API-key management; duplicate-scope rejection; regression and Deno type-check gates.
**Database migrations / production deployment / secret changes / merge:** NOT PERFORMED

## Finding

The API-key Edge Function already authenticated the bearer token, derived owner identity from the verified user, stored only a SHA-256 digest of a high-entropy generated key, returned the raw key once, and constrained list/revoke operations by owner.

The request parser nevertheless tolerated unrecognized fields and duplicate scope entries. This was not evidence of an authorization bypass, but permissive parsing increases ambiguity, makes client/server contracts harder to audit, and can hide caller mistakes.

## Implementation

- Added `supabase/functions/_shared/api-key-request.mjs`, a pure discriminated request parser shared by the Edge Function and Node regression tests.
- Each action now accepts an exact field allowlist:
  - `list`: action only.
  - `create`: action, label, optional scopes and optional expiry.
  - `revoke`: action and UUID id only.
- Reject unknown fields instead of silently ignoring them.
- Normalize labels by trimming and enforcing 1–100 characters.
- Default scopes to `api:read`; permit only `api:read` and `api:write`.
- Reject duplicate scopes, empty scopes and more than two scopes.
- Enforce integer expiry days in the inclusive range 1–365.
- Validate revoke IDs before database access.
- Reuse the same parser in the deployed Edge Function entrypoint.
- Add Node adversarial tests for unknown keys, invalid types, duplicate scopes, expiry boundaries, malformed IDs and unsupported actions.
- Add a Deno type-check step for the API-key manager Edge Function.

## Security properties retained

- JWT validation via Supabase Auth `getUser`.
- Owner identity comes only from the verified JWT.
- Service-role client remains server-side.
- List and revoke queries remain owner-filtered.
- Browser-visible projections exclude `key_hash`.
- Raw API key is returned once; only digest is stored.
- Request body remains capped at 2 KiB.
- Exact-origin CORS remains enforced by the shared policy.

## Verification required

- `npm ci`
- `npm audit --audit-level=low`
- TypeScript lint
- Node regression suite, including Phase 100 parser tests
- Deno type-check of `ashaa-api-key-manager/index.ts`
- Existing CORS, worker security, worker, dispatcher and AI runtime checks
- Production Vite build

## Known limitations

- No persistent per-owner API-key creation rate limiter was added; this needs a database-backed atomic quota design and a separately reviewed migration.
- No production function deployment or live Supabase invocation was performed.
- This phase does not verify hosted project grants, current deployed Edge Function parity, key-authentication consumers, or provider/network rate limits.
- A SHA-256 digest is suitable here only because generated keys have high entropy; do not reuse this design for human passwords.
- Passing CI does not prove the absence of unknown vulnerabilities.

**Status before CI:** IMPLEMENTED / NOT YET VERIFIED.
**Production/live parity:** NOT VERIFIED.
**Release status:** NOT APPROVED.
