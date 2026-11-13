# INFINITEGX.7 — Autonomous Intelligence OS

## Backend development
Install Python 3.11+, copy .env.example to .env, configure local secrets and database URL,
then start PostgreSQL and apply migrations:

```bash
python -m pip install -e ".[dev]"
docker compose up -d db
alembic upgrade head
uvicorn backend.app.main:app --reload
```

Protected API endpoints require Authorization: Bearer <token> and X-Tenant-ID: <UUID>.
Never commit real secrets. API docs are available at /docs while the local server is running.

Company Brain endpoints: POST /api/v1/memory and GET /api/v1/memory/search.
Embedding providers are not configured by default; lexical search remains available.

## Architecture and security requirements
- [Agent Swarm architecture](docs/architecture/agent-swarm.md)
- [Cognition architecture](docs/architecture/cognition.md)
- [Owner-only security requirement](docs/security/owner-only-security.md)
- [Phase 7 report](docs/phase-reports/phase-7-agent-swarm.md)
- [Phase 6 report](docs/phase-reports/phase-6-cognition.md)

The intended product model is private and single-owner: one explicitly provisioned owner identity,
no public registration, server-side authorization on every protected operation, and owner-controlled
recovery. This is a mandatory target, **not a claim that end-to-end enforcement is already complete**.
See the security document for required controls and verification gates.

Passing CI does not mean production readiness. Review phase reports and security limitations
before deployment. No merge or production deployment is implied by phase branch work.
