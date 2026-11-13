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

Passing CI does not mean production readiness. Review phase reports and security limitations
before deployment.
