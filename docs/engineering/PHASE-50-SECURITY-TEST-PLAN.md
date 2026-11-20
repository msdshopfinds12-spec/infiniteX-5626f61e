# InfiniteX Phase 50 — Security Test Plan

**Status:** TEST PLAN — tests not yet executed  
**Environment:** isolated local/test project with synthetic accounts only

## Test identities

Create two synthetic accounts, Owner A and Owner B, plus an unauthenticated client. Never use production user records for destructive or adversarial tests.

## Required negative tests

1. Missing Authorization header is denied.
2. Malformed, expired, revoked, or wrong-project token is denied.
3. User-supplied `user_id`, `owner_id`, `role`, or `permissions` is rejected or ignored as authority.
4. Missing or unavailable policy source denies all capabilities.
5. Malformed, expired, or subject-mismatched permission snapshot denies access.
6. Owner B cannot read or mutate Owner A resources through tables, views, RPCs, or Edge Functions.
7. Browser role cannot select `platform_api_keys.key_hash`.
8. Browser cannot create a workflow run with forged status/output/error/worker timestamps.
9. Enqueue endpoint creates only a server-selected queued state and derives owner from verified Auth identity.
10. Worker transitions reject unauthorized callers and invalid state transitions.
11. Unlisted CORS origin is rejected; preflight behavior is deterministic.
12. Error responses do not disclose resource existence, tokens, hashes, or internal exception details.

## Positive controls

- Owner A can read only their own explicitly permitted resources.
- Owner B can read only their own explicitly permitted resources.
- A valid token with an explicitly granted read capability can access the matching read endpoint.
- Revoked/expired membership loses access on the next authorization evaluation.
- Safe API-key metadata can be returned without hash fields.

## Evidence required

For every test, record exact commit SHA, command, environment, test identity class (synthetic), expected result, actual result, and CI run URL. Do not report a test as passed without an executed result.

## Release acceptance

No production migration or deployment until all negative tests pass, the live grants/RLS/function paths are reviewed, and a human explicitly approves the migration and release.
