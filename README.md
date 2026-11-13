# infiniteGX.7 — Autonomous Intelligence OS

INFINITEGX.7 (INI: Intelligent Neural Infrastructure) is developed as a modular, governed AI operating system.

## Architecture baseline
- `iq_core/`: importable Python package for kernel, agents, memory, cognition, governance, execution, capabilities, and observability.
- `backend/`: reserved for the API implementation in later phases.
- `frontend/`: existing React + TypeScript + Vite control-center prototype, preserved as an npm workspace.
- PostgreSQL: canonical transactional database target. The local Compose service is development-only; schema, migrations, tenant isolation, and authorization belong to later phases.
- Vector search and knowledge graph are Company Brain capabilities and do not replace database access controls.

## Requirements
- Python 3.11+
- Node.js 20+ and npm
- Docker only when using local PostgreSQL

## Setup
1. Copy `.env.example` to `.env` and change the local development password.
2. Create a virtual environment and install Python dependencies:
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   # Windows PowerShell: .venv\\Scripts\\Activate.ps1
   python -m pip install --upgrade pip
   python -m pip install -e ".[dev]"
   ```
3. Install frontend dependencies: `npm ci`
4. Start the frontend: `npm run dev`
5. Optional local PostgreSQL: `docker compose up -d db`

## Commands
- `./scripts/setup.sh` — install development dependencies.
- `./scripts/dev.sh` — start the frontend.
- `./scripts/test.sh` — Python tests, frontend lint, and production build.
- `./scripts/health_check.sh` — inspect local tools and project configuration.
- `./scripts/backup.sh` — back up the local Compose database.

## Verification rules
A phase is not complete merely because folders or files exist. Every phase must be implemented, integrated, tested, and verified. Unknown or unrun checks remain explicitly marked.

The current frontend is a prototype with static dashboard data. It is not connected to a production API, authentication, persistent business memory, or an execution engine.

See `docs/architecture/system-foundation.md` and `docs/phase-reports/`. Phase 1 does not deploy production services.
