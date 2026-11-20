# InfiniteX Phase 50 — Backend API Contract

**Status:** PROPOSED CONTRACT — not deployed  
**Branch:** `feat/phase-50-trusted-authorization`

## Common request requirements

- HTTPS only in deployed environments.
- Authorization: Bearer <Supabase access token>.
- Validate token using Supabase Auth server-side `getUser(token)`.
- Enforce exact configured CORS origins; reject unlisted browser origins.
- Accept JSON only, enforce a small request-body limit, and reject unknown fields.
- Responses containing identity or account data use `Cache-Control: no-store`.
- Never log access tokens, API keys, hashes, or sensitive request bodies.

## POST /functions/v1/authorization

Purpose: return a minimal UI capability projection after server-side identity verification and authoritative policy lookup.

Request:
```json
{}
```

Unknown fields are rejected. The browser cannot submit a subject, owner, role, or permission list.

Success response (only after policy source is implemented):
```json
{
  "subjectId": "verified-auth-user-id",
  "permissions": ["workspace.read"],
  "expiresAt": 0
}
```

Until an authoritative membership/role source is verified, the implementation MUST return an empty permission set and a non-granting policy status. It must not infer administrator access from user metadata.

## POST /functions/v1/account-data

Future read-only endpoint. It must derive the subject from the verified token, validate a fixed resource allowlist, use explicit column projections, and rely on RLS. Do not accept `owner_id` or arbitrary table/column names.

## POST /functions/v1/workflow-enqueue

Future enqueue-only endpoint. Request contains only a workflow identifier and strictly validated execution parameters. Server verifies ownership and eligibility, then creates a queued run using a server-selected initial state. It rejects all client-supplied lifecycle/result fields. Idempotency and rate limiting are required before enabling execution.

## API-key metadata

Use a fixed safe-column projection. `key_hash` must never cross the browser boundary. Create/rotate/revoke operations require a separately reviewed server-side design and must not return stored hashes.

## Error contract

Use stable non-sensitive codes:
- `UNAUTHENTICATED` — token missing/invalid/expired.
- `FORBIDDEN` — authenticated but not authorized.
- `POLICY_UNAVAILABLE` — authoritative policy cannot be established; deny.
- `INVALID_REQUEST` — malformed or unexpected input.
- `NOT_FOUND` — resource absent or not visible to the caller.
- `RATE_LIMITED` — request limit reached.
- `INTERNAL_ERROR` — generic response; details stay in protected server logs.

Never reveal whether another user's resource exists.
