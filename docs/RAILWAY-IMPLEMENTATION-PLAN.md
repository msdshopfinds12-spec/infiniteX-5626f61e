# InfiniteGX Railway implementation plan

## Guardrails
- Work stays on feature/railway-infinitegx-engineering.
- main remains untouched.
- No Railway resource is created or modified.
- No deployment or billing change is performed.
- Secrets are never committed.

## API foundation
- React/Vite frontend remains at repository root.
- Node.js 22 + Hono API under apps/api.
- OIDC JWT verification through remote JWKS.
- Zod request validation, security headers, strict origin allowlist.
- Bounded OpenAI-compatible provider adapter.
- Optional PostgreSQL pool and tenant-scoped AI usage persistence.
- SQL schema with forced RLS for tenant-owned tables.
- Dockerfile, Railway config template, CI workflow, docs.

## Important operational limits
- Rate limiting remains process-local; multi-replica deployments need a shared store.
- The initial identity mapping supports one tenant per issuer/subject.
- User/tenant provisioning is intentionally administrative, not public.
- Usage persistence records token counts but not provider invoice cost.
- No automatic migrations or deploys are configured.

## Next gates
1. Generate and commit package-lock.json for apps/api.
2. Run typecheck, unit/integration tests, and production build in a clean environment.
3. Add database integration tests for RLS using a non-owner role.
4. Add user provisioning and audit-event write path.
5. Add durable quotas and monetary cost ledger before exposing AI generation broadly.
6. Add shared rate limiting and durable queue before horizontal scaling.
7. Obtain separate approval before Railway provisioning, migration execution, or deployment.