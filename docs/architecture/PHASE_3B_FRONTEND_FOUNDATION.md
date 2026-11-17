# InfiniteX — Phase 3B Frontend Foundation

**Status:** Implemented on an isolated branch; CI verification pending.  
**Baseline:** `b508a74fc44e75d509597ffcb0f4bcb0c98bccb3`  
**Branch:** `chore/phase-3b-frontend-foundation`

## Objective

Establish a small, testable frontend foundation without implying that demo UI is a production AI platform. Preserve the current React 18, TypeScript, Vite 8.3.7 stack and avoid new paid services or runtime dependencies.

## Current verified application shape

- React 18 + TypeScript + Vite 8 frontend.
- Existing dashboard, navigation, theme hook, sample agent records, illustrative pipeline stages and sample logs.
- Existing Node test runner and Playwright/axe browser suite.
- No verified production API, authentication, workspace authorization, database/RLS, provider execution, or live telemetry.

## Target boundaries

```text
React UI / feature components
          |
          v
Feature hooks and view state
          |
          v
Typed API boundary (src/lib/api-client.mjs)
          |
          v
Authenticated server API (future; not part of this phase)
          |
          +--> identity and workspace authorization
          +--> domain services / task lifecycle
          +--> provider adapters (server-side only)
          +--> PostgreSQL with workspace-scoped RLS
```

The API client is transport infrastructure only. It does not authenticate users, authorize workspaces, validate server permissions, or make provider calls by itself.

## API boundary guarantees

- HTTPS is required except for localhost development.
- Relative request paths must remain on the configured origin.
- Browser credentials are omitted by default.
- Redirects are rejected.
- Requests use a bounded timeout and caller cancellation.
- Responses must be JSON (or HTTP 204) and may be checked with a caller-supplied runtime validator.
- Error messages do not include server response bodies.
- No automatic retries. A future retry policy must be method-aware and idempotency-aware.
- No secrets are stored in local storage or embedded in this client.

## Error contract

`ApiClientError.code` is one of:

- `UNTRUSTED_URL`
- `INVALID_REQUEST_BODY`
- `HTTP_ERROR`
- `UNEXPECTED_CONTENT_TYPE`
- `INVALID_JSON`
- `INVALID_RESPONSE`
- `TIMEOUT`
- `ABORTED`
- `NETWORK_ERROR`

The optional HTTP status is metadata, not an authorization signal.

## Implementation sequence

1. Keep sample/demo records visibly labeled.
2. Adopt the API client only when a server endpoint and runtime response schema exist.
3. Introduce domain-specific API modules rather than coupling components to fetch.
4. Add authentication and workspace authorization on the server before enabling mutations.
5. Add negative authorization tests and RLS tests before any real user data.
6. Add provider adapters behind server-side interfaces and quota/timeout controls.
7. Keep AI-generated code and workflow actions behind human approval.

## Explicit non-goals

- No backend or database connection.
- No authentication or session implementation.
- No AI provider integration or agent execution.
- No deployment, migration, secrets, billing, or repository settings changes.
- No claims of production readiness based on frontend tests alone.

## Release gates

- PLAN: architecture and manifest reviewed.
- BUILD: isolated branch only.
- TEST: GitHub Actions must pass on the final branch head.
- AUDIT: inspect diff, workflow permissions, dependency changes and test evidence.
- RELEASE: human approval required; no merge or deployment in Phase 3B.
