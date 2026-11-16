# InfiniteGX API — Railway deployment plan

## Current status

This repository contains a separate API foundation under `server/`. It is not yet connected to a live database, authentication provider, or AI provider.

## Recommended Railway setup

- Railway project: `victorious-enchantment`
- Environment: `production`
- Service name: `infinitegx-api`
- Source repository: `msdshopfinds12-spec/infiniteX-5626f61e`
- Branch: `main` only after review and merge approval; for testing, use `feat/railway-api-foundation`
- Root directory: repository root
- Dockerfile path: `server/Dockerfile`
- Healthcheck path: `/health/live`
- Public domain: do not create until a human approves exposure and CORS origins are configured.

## Required variables

Set only after reviewing the target service and intended environment:

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `PORT` should be supplied by Railway
- `CORS_ORIGINS` must contain the exact approved frontend origin(s), comma-separated.
- `LOG_LEVEL=info`

Do not add `DATABASE_URL` until the database provider and adapter are selected. A URL alone does not make readiness healthy.

## Safe deployment sequence

1. Review this feature branch and CI results.
2. Run `npm install` and `npm run build` in `server/`; run `npm test`.
3. Connect the repository to a new Railway service in `victorious-enchantment`.
4. Confirm the service root and Dockerfile path.
5. Review Railway's deployment/configuration plan and estimated cost.
6. Deploy only after explicit human approval.
7. Verify terminal deployment status and HTTP health checks.

## Rollback

Keep the previous successful deployment available. If a release fails health checks, stop rollout and use Railway's rollback controls after inspecting logs. Do not delete the previous deployment or database as part of rollback.
