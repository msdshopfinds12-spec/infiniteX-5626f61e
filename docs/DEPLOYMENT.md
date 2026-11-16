# Railway deployment runbook — approval required

This repository contains a Railway configuration template and Dockerfile only. CI does not deploy.

Before deployment:
1. Confirm the target Railway project and service.
2. Preserve the existing function-bun service.
3. Create a separate API service only after approval.
4. Set root directory to repository root and Dockerfile path to apps/api/Dockerfile.
5. Configure variables from .env.railway.example using Railway's secret variable UI.
6. Set health check path to /api/health.
7. Review resource limits and billing limits.
8. Pass build, tests, and security gates.
9. Obtain explicit deployment approval.
10. Verify health, auth, logs, and cost after rollout.

Never commit secrets or run migrations automatically during deployment.