# InfiniteX Phase 50 — Backend API Contract

**Status:** Initial fail-closed endpoint implemented; authoritative capability grants are intentionally unavailable  
**Branch:** `feat/phase-50-trusted-authorization`

## Common request requirements

- HTTPS in deployed environments.
- Authorization: Bearer <Supabase access token>.
- Verify identity with Supabase Auth server-side `getUser(token)`.
- Enforce exact configured CORS origins using the existing shared helper.
- Accept JSON only; cap the streamed request body at 1 KiB.
- Reject unknown request fields.
- Responses use `Cache-Control: no-store`.
- Never log access tokens, API keys, hashes, or sensitive request bodies.

## POST /functions/v1/authorization

**Implemented behavior:** validates the request, verifies the Supabase user, then returns `503 POLICY_UNAVAILABLE` with an empty permission list because the authoritative membership/role source has not yet been verified.

Request:
```json
{}
```

The endpoint rejects caller-supplied subject, owner, role, or permissions fields.

Expected responses:
- `200` is NOT currently returned; no capability grant is implemented.
- `400 INVALID_REQUEST` — malformed JSON or unknown request fields.
- `401 UNAUTHENTICATED` — missing or invalid user token.
- `403 ORIGIN_NOT_ALLOWED` — browser origin not in the exact allowlist.
- `405 METHOD_NOT_ALLOWED` — unsupported method.
- `413 INVALID_REQUEST` — request body exceeds the limit.
- `415 UNSUPPORTED_MEDIA_TYPE` — request is not JSON.
- `503 POLICY_UNAVAILABLE` — identity verified, but authorization policy is not yet authoritative; permissions are always empty.
- `500 INTERNAL_ERROR` — missing server configuration or unexpected failure.

The endpoint does not use `user_metadata`, client-supplied claims, or an unverified role assumption. This is an authentication boundary and deny-by-default placeholder, not a complete authorization system.

## Future: POST /functions/v1/account-data

Read-only endpoint. Derive the subject from the verified token, validate a fixed resource allowlist, use explicit column projections, and rely on RLS. Do not accept `owner_id` or arbitrary table/column names.

## Future: POST /functions/v1/workflow-enqueue

Enqueue-only endpoint. Accept a workflow identifier and strictly validated execution parameters. Verify ownership and eligibility, then create a queued run using server-selected initial state. Reject all client-supplied lifecycle/result fields. Idempotency and rate limiting are required before enabling execution.

## API-key metadata

Use a fixed safe-column projection. `key_hash` must never cross the browser boundary. Create/rotate/revoke operations require a separately reviewed server-side design and must not return stored hashes.

## Error contract

Stable non-sensitive codes include:
- `UNAUTHENTICATED`
- `FORBIDDEN`
- `POLICY_UNAVAILABLE`
- `INVALID_REQUEST`
- `NOT_FOUND`
- `RATE_LIMITED`
- `INTERNAL_ERROR`

Never reveal whether another user's resource exists.
