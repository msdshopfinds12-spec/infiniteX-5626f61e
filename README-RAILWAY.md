# InfiniteGX Railway API foundation

This branch adds an isolated API foundation without changing the existing frontend or Railway resources.

## Local setup
1. Install Node.js 22 or newer.
2. Configure local environment variables using .env.railway.example as a reference.
3. Configure a test identity provider and AI provider before calling protected endpoints.
4. From apps/api run npm install, npm run dev.

## Endpoints
- GET /api/health
- GET /api/ready
- POST /api/v1/ai/generate (JWT required)

## Scope
This is an initial engineering foundation, not a complete production AI platform. PostgreSQL, durable usage accounting, queues, multi-provider routing, and frontend integration remain future phases. See docs/RAILWAY-IMPLEMENTATION-PLAN.md.