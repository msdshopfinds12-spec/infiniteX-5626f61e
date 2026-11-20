# Phase 76 — API-key Frontend Contract

**Status:** IMPLEMENTED — isolated frontend service and contract tests added; CI verification pending.  
**Base:** `phase-75/api-key-migration-rehearsal`  
**Scope:** Browser adapter to the existing authenticated `ashaa-api-key-manager` Edge Function.

## Findings

The checked-in browser metadata contract already excludes `key_hash`. The deployed/candidate Edge Function performs list, create, and revoke through a server-side client, derives the owner from the verified bearer token, filters list/revoke by `owner_id`, and returns only an allowlisted metadata projection. The browser should therefore call the Edge Function rather than access `platform_api_keys` directly.

## Implementation

- Added `src/features/security/api-key-service.ts`.
- The service invokes only `ashaa-api-key-manager`; it does not query `platform_api_keys` directly.
- List/create/revoke responses are runtime-validated and reject unexpected fields, including `key_hash`.
- Client-side validation mirrors server constraints for label length, allowed scopes, expiry range, and UUID format. Server validation remains authoritative.
- Provider and network failures are mapped to stable error codes; raw provider details are not surfaced.
- The one-time raw key is returned only from successful creation, as already designed by the server function. Callers must display it once and must not persist or log it.
- Added focused tests for request payloads, local validation, malformed responses, provider/network errors, owner-scoped server operations, and absence of direct browser table access.

## Security contract

1. Never select or return `key_hash` to browser clients.
2. Never accept `owner_id` from caller input; the Edge Function derives it from `auth.getUser(bearer)`.
3. List and revoke remain owner-filtered server-side.
4. Revoke updates only `revoked_at`.
5. Keep the service-role credential exclusively in Edge Function environment.
6. RLS and database column grants remain defense-in-depth controls; the browser service is not an authorization boundary.

## Verification

Workflow: `.github/workflows/phase-76-api-key-frontend-contract.yml`

- `npm ci`
- `npm run test:api-key-service`
- `npm run lint`
- `npm run build`

CI results are pending until GitHub Actions completes on the exact final commit.

## Limits and next steps

This phase adds a typed service boundary; it does not yet add a complete API-key management screen, perform a live authenticated browser test, or prove the deployed Edge Function source matches the branch candidate. The frontend view should be wired only after this service passes CI and the actual UI design/accessibility states are reviewed.

No live database query/write, migration, function deployment, secret/config change, PR merge, Vercel deployment, or billing change was performed.

## CI evidence

- Workflow run: [Phase 76 API-key Frontend Contract](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44820932001)
- Tested source commit: `a6fc02d6bc43459a6d406ff67bd714cf3ee12010`
- Result: `SUCCESS`
- `npm ci`: passed
- `npm run test:api-key-service`: passed
- `npm run lint`: passed
- `npm run build`: passed

The final branch head also includes a documentation-only report commit after the tested source commit. No application or test source changed after the CI-tested commit.
