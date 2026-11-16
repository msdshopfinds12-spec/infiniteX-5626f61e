# INFINITEGX.7 — Autonomous Intelligence OS

## Backend development

Install Python 3.11+, copy .env.example to .env, configure a trusted identity provider and local
database URL, then start PostgreSQL and apply only migrations that have been separately approved:

```bash
python -m pip install -e ".[dev]"
docker compose up -d db
alembic upgrade head
uvicorn backend.app.main:app --reload
```

Protected API endpoints require a signed JWT in `Authorization: Bearer <token>`. The backend
verifies the issuer, audience, signature, expiry, and configured owner subject. Tenant identity
is derived from the server-side `INFINITEGX_OWNER_TENANT_ID`; client-supplied `X-Tenant-ID`
headers are ignored and must never be used for authorization.

Required identity settings are documented in `.env.example` and
`docs/security/authentication-and-tenant-boundary.md`. Never commit real secrets. API docs are
available at `/docs` while the local server is running.

Company Brain endpoints: `POST /api/v1/memory` and `GET /api/v1/memory/search`.
Embedding providers are not configured by default; lexical search remains available.

Task creation supports an optional `Idempotency-Key`; replays with the same request return the
original task, while reusing a key for a different request returns HTTP 409.

## Architecture and security requirements

- [Agent Swarm architecture](docs/architecture/agent-swarm.md)
- [Cognition architecture](docs/architecture/cognition.md)
- [Owner-only security requirement](docs/security/owner-only-security.md)
- [Authentication and tenant boundary](docs/security/authentication-and-tenant-boundary.md)
- [Phase 7 report](docs/phase-reports/phase-7-agent-swarm.md)
- [Phase 6 report](docs/phase-reports/phase-6-cognition.md)

The intended product model is private and single-owner: one explicitly provisioned owner identity,
no public registration, server-side authorization on every protected operation, and owner-controlled
recovery. Passing CI does not mean production readiness. PostgreSQL RLS, real identity-provider
integration, production secrets, and operational recovery controls must be verified before release.

No merge or production deployment is implied by phase branch work.
