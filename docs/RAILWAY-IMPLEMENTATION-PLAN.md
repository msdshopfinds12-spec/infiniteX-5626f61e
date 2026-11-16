# InfiniteGX Railway implementation plan

## Guardrails
- Isolated feature branch; main remains unchanged.
- No Railway resource is created or modified by this change.
- No workflow deploys to Railway.
- Never commit provider keys, auth secrets, database URLs, or access tokens.
- Production rollout requires separate human approval.

## Implemented foundation
- Existing React/Vite frontend remains at repository root.
- Isolated Node.js 22 + Hono API under apps/api.
- GET /api/health and GET /api/ready.
- POST /api/v1/ai/generate requires JWT verification.
- OpenAI-compatible Chat Completions adapter, bounded prompt/output and timeout.
- Process-local per-subject rate limiting.
- Dockerfile, Railway config template, CI checks, and documentation.
- Provider usage is returned if available but is NOT persisted or billed by this app.

## Not implemented
- PostgreSQL persistence, migrations, tenant isolation, or RLS.
- Durable queues, Redis, workflow scheduling, or distributed rate limiting.
- User registration, token issuance, refresh, or recovery.
- Multi-provider fallback, durable token quotas, cost ledger, billing, or subscriptions.
- Frontend-to-API integration.

## Next gates
1. Generate and commit a reviewed package-lock.json for apps/api.
2. Run install, typecheck, tests, and build in a clean environment.
3. Add route, auth, and provider integration tests.
4. Review identity provider claims, JWKS, and CORS values.
5. Review database schema and RLS design before adding persistence.
6. Review Railway resource sizing and billing cap.
7. Obtain separate approval before Railway provisioning or deployment.