# InfiniteX Phase 3A — Server-Side AI Gateway Foundation

**Scope:** provider-neutral server boundary, typed candidate registry, deterministic mock routing, request controls, metadata-only audit events, and CI coverage.  
**Runtime mode:** mock only when explicitly enabled. Otherwise disabled.  
**External providers, repository writes, and database access:** disabled.

## What is implemented

- Vercel-compatible serverless endpoint: `POST /api/ai`.
- Strict JSON request validation; unknown fields are rejected.
- Maximum request size: 8 KiB. Maximum prompt: 4,000 characters.
- Same-host Origin check when an Origin header is present; no permissive CORS response.
- POST-only endpoint, defensive response headers, and no-store caching.
- Per-instance sliding-window rate limiter (default 20 requests / 60 seconds).
- Metadata-only in-memory audit sink; raw prompt text is not stored or returned.
- Typed candidate registry for IQ Core, EVE Factory, EVE Chat, EVE Data, EVE Content, EVE Marketing, and Personal Agent.
- Explicit blocking of repository writes, merges, CI reruns, deployments, migrations, secrets, billing, and publishing.
- Automated tests and a dedicated server TypeScript check.
- No additional npm dependencies.

## Request example

```json
{
  "capability": "code.review",
  "input": { "prompt": "Review this approved source excerpt." }
}
```

Supported task capabilities: `chat.respond`, `code.review`, `data.analyze`, `content.draft`, `marketing.plan`, and `personal.assist`.

A successful response means only that validation and deterministic mock routing worked. The preferred candidate remains `not-connected`; no AI model or external service is invoked.

## Fail-closed configuration

Set `INFINITEX_AI_MODE=mock` to enable the deterministic mock endpoint. Any missing or other value—including `live`—disables the endpoint. There is no live provider mode in Phase 3A.

Copy `.env.example` to a local environment file if local mock testing is needed. Do not commit local environment files.

## Security limitations

- The mock endpoint has no user authentication because it has no access to private data, providers, or side-effecting tools. Do not add sensitive context or credentials.
- The rate limiter and audit sink are in-memory per serverless instance. They are not global abuse prevention or durable/tamper-evident audit storage.
- Origin validation is not authentication.
- The Vercel serverless route is type-checked separately from the Vite browser bundle.
- No production deployment, hosting behavior, auth, global quotas, durable audit storage, or end-to-end agent integration has been verified.

## Verification commands

```bash
npm run typecheck:server
npm test
npm run lint
npm run build
```

## Required gates before live AI

1. Verify hosting runtime and deployment behavior.
2. Implement authentication and server-side authorization.
3. Add shared rate limiting, quotas, and durable audit storage.
4. Review provider data handling, retention, and budget limits.
5. Implement one adapter at a time with isolated integration tests.
6. Isolate all code execution from the API process.
7. Require separate approval for every external write, PR, merge, migration, and release.
