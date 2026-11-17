# GH-16 — API Contract Plan

**Status:** Proposed contract; routes are not claimed to exist.

## 1. Contract principles

- REST over HTTPS with JSON payloads.
- Version prefix: `/api/v1`.
- Server-side runtime validation for every request.
- Explicit authentication and workspace authorization.
- Stable error envelope and documented status codes.
- Bounded pagination and request sizes.
- No secrets or sensitive internal details in responses.
- OpenAPI documentation generated from the same schemas where practical.

## 2. Standard error envelope

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "requestId": "req_example",
    "details": []
  }
}
```

Do not return stack traces, SQL errors, tokens, or internal secrets. In production, details should be minimal and safe.

Suggested status mapping:
- 400 malformed or invalid request
- 401 missing/invalid authentication
- 403 authenticated but unauthorized
- 404 resource absent or intentionally concealed
- 409 state conflict
- 422 semantically invalid transition (if consistently adopted)
- 429 rate limit
- 500 unexpected server failure
- 503 required dependency unavailable

## 3. Initial endpoint proposal

| Method | Path | Purpose | Initial risk |
|---|---|---|---|
| GET | `/healthz` | Process liveness | Low; no dependency detail |
| GET | `/readyz` | Required dependency readiness | Low; no secrets |
| GET | `/api/v1/me` | Current authenticated principal | Auth required |
| GET | `/api/v1/workspaces` | Workspaces current user can access | Auth + membership |
| GET | `/api/v1/workspaces/{workspaceId}/agents` | List workspace agents | Auth + workspace policy |
| POST | `/api/v1/workspaces/{workspaceId}/agents` | Register agent metadata | Auth + role + validation |
| GET | `/api/v1/workspaces/{workspaceId}/tasks` | List workspace tasks | Auth + workspace policy |
| POST | `/api/v1/workspaces/{workspaceId}/tasks` | Create task | Auth + role + validation |
| GET | `/api/v1/workspaces/{workspaceId}/activity` | List permitted activity | Auth + workspace policy |

These are proposed contracts only. Implement one route at a time after source inspection and architecture approval. Do not expose agent execution endpoints until a secure execution model exists.

## 4. Resource ownership

Every workspace-scoped query must derive authorization from the authenticated principal and server-side membership. A client-provided `workspaceId` is a selector, not proof of access.

Required negative tests:
- User A cannot list User B's workspace resources.
- A member cannot perform owner-only operations.
- Removed membership loses access on the next authorized request.
- Resource IDs from another workspace cannot be used to bypass policy.
- Missing/invalid identity is rejected before protected data access.

## 5. Pagination

Use a bounded page size, for example:
```text
GET /api/v1/workspaces/{id}/tasks?limit=25&cursor=...
```

- Default limit: 25.
- Maximum limit: 100 (adjust only with evidence).
- Cursor must be opaque and validated.
- Ordering must be stable and deterministic.
- Avoid unbounded list responses.

## 6. Input validation

Validate:
- Path identifiers and query parameters.
- JSON content type and body size.
- String length and allowed enum values.
- State transitions and cross-field invariants.
- URLs and provider identifiers when present.
- Any user-authored text before persistence/rendering.

Reject unknown fields by default for security-sensitive writes, unless forward compatibility requires a documented policy.

## 7. Agent and task semantics

Agent records represent metadata/configuration unless a real execution engine is implemented. UI must not imply an agent is active or running from a database row alone.

Suggested task states:
`queued`, `running`, `succeeded`, `failed`, `cancelled`.

Allowed transitions must be explicit and server-enforced. Terminal states should not silently transition back to running. Add idempotency and concurrency controls before supporting retries or duplicate submissions.

## 8. Contract testing

- Schema unit tests.
- Route integration tests.
- Authentication and authorization matrix tests.
- Invalid input and oversized payload tests.
- Pagination boundary tests.
- Error envelope tests.
- OpenAPI contract consistency checks.
- Frontend client compatibility tests.

## 9. Compatibility and deprecation

- Do not break existing UI consumers without a migration plan.
- Additive changes preferred.
- Breaking changes require a new API version or documented migration.
- Keep frontend and backend contract tests in CI.
- Never silently convert sample/demo payloads into live data.
