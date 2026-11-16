# InfiniteX System Architecture

**Reviewed:** 2026-11-16  
**Branch:** `feature/infiniteX-platform-integrations`  
**Status:** Source-reviewed architecture baseline; runtime and production topology remain unverified.

## 1. Executive decision

Keep the existing React/Vite frontend and Hono API as separate application layers. Do not add a second backend framework, duplicate GitHub connector, or an MCP server inside the browser. Treat MCP servers as developer/agent tools unless a separately designed, secured server-side tool gateway is approved.

The repository contains a meaningful backend foundation, but it is not yet evidence of a complete production AI platform. In particular, task creation queues records but explicitly reports that no worker is configured; there is no verified conversation-history API or end-to-end streaming chat workflow.

## 2. Verified technology baseline

| Layer | Repository evidence | Status |
|---|---|---|
| Web client | React 18.3.1, React DOM 18.3.1, TypeScript 5.6.3, Vite 5.4.10 | VERIFIED in manifest |
| API | Hono 4, TypeScript, Node server adapter | VERIFIED in source/manifest |
| Authentication | jose remote JWKS, RS256 allowlist, issuer/audience checks | IMPLEMENTED; live Auth0 flow unverified |
| Validation | Zod request/environment schemas | IMPLEMENTED in inspected routes/config |
| Database access | pg pool and tenant transaction helper | IMPLEMENTED; live DB connectivity unverified |
| Data model | tenants, app_users, agents, tasks, ai_usage, audit_events migration | SQL file exists; migration not applied/verified |
| AI provider | OpenAI-compatible `/chat/completions` adapter with timeout and output ceiling | IMPLEMENTED; provider credentials/service unverified |
| Task execution | Persistent queued task records and cancellation for queued tasks | PARTIAL; no worker configured |
| Tests | API Vitest config and test files; API package has `test` script | PRESENT; execution not verified |
| Frontend tests | Root package has no test script in inspected manifest | NOT CONFIGURED at root |
| MCP gateway | No application-side MCP gateway verified | NOT IMPLEMENTED |
| Conversation history | No dedicated conversation/message API verified | NOT IMPLEMENTED / UNVERIFIED |

## 3. Target logical architecture

```text
Android / Desktop Browser
  React 18 + TypeScript + Vite
  ├── Accessible UI and responsive layout
  ├── Authentication provider (after tenant setup)
  ├── Typed API client
  ├── Conversation state (not yet persistent)
  └── Error/loading/empty states
            │ HTTPS + API access token
            ▼
Hono API (Node.js runtime)
  ├── Request ID, secure headers, body limit, exact CORS
  ├── JWT verification (issuer, audience, RS256, exp/nbf)
  ├── Authentication + per-resource authorization
  ├── Zod input validation
  ├── Rate limiting and request timeouts
  ├── AI provider adapter
  ├── Task and agent route handlers
  └── Repository layer / tenant transactions
            │
            ▼
PostgreSQL
  ├── tenants / app_users
  ├── agents / tasks
  ├── ai_usage / audit_events
  └── RLS policies (migration exists; runtime role behavior must be tested)

Separate developer-tool plane:
  GitHub connector | Context7 | Playwright | optional provider MCPs
```

## 4. Architectural boundaries

- The browser must never receive database credentials, service-role keys, provider API keys, or MCP credentials.
- The API must derive identity from the verified token, never from a client-supplied user ID.
- Every resource operation must enforce tenant and ownership checks at the repository/query layer.
- Model output and tool output are untrusted data. Render as text or safely sanitized Markdown, never raw HTML.
- MCP is not an authorization boundary. Each tool call requires server-side validation and policy enforcement.
- Queue persistence does not equal task execution. A worker, lease/claim protocol, retry policy, dead-letter strategy and observability are still required before claiming asynchronous execution.
- A SQL migration file is not proof that a database has been migrated.

## 5. Recommended implementation order

1. Establish a reproducible baseline: lockfiles, Node version, typecheck, build and existing API tests.
2. Review tenant isolation, RLS role assumptions, agent ownership and idempotency behavior.
3. Confirm the selected database and hosting platform without making changes.
4. Implement persistent conversations and message ownership only after schema/API contract approval.
5. Implement a task worker only after queue semantics, retry limits and cancellation behavior are specified.
6. Integrate authentication in the UI after Auth0 tenant and API audience are confirmed.
7. Add browser, accessibility, API contract and security tests.
8. Consider MCP-backed developer tools separately from end-user runtime capabilities.

## 6. Release gate

No release is complete until CI, tests, build, browser QA, tenant-isolation tests, dependency audit, secrets scan, accessibility review, operational logging and a human release approval are recorded. This document does not authorize migrations, dependency installs, commits beyond the documentation scope, or deployment.
