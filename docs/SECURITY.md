# Security baseline

- JWTs are verified against remote JWKS with issuer and audience checks.
- AI, agent, and task routes require authentication.
- Request bodies are bounded before JSON parsing; route schemas validate accepted fields.
- Provider keys are read only by the API process and are not returned to clients.
- Provider prompts and response bodies are not logged.
- Security headers and a configured CORS allowlist are enabled; CORS is not authentication.
- Production requires auth issuer, audience, and JWKS URL.
- Production AI base URL must use HTTPS.
- Tenant-scoped repositories set the tenant context transaction-locally.
- The core SQL migration defines forced row-level security policies for tenant-owned tables.

## Deployment blockers and limitations

- The SQL migration is committed but **NOT applied**. Tenant isolation is therefore not active in any database until a reviewed migration is applied and verified using the actual non-owner runtime role.
- The process-local rate limiter is bounded in memory but is not distributed across replicas.
- No durable quota ledger or monetary spend ceiling exists.
- Identity-provider issuer, audience, JWKS, and subject-to-tenant provisioning require environment-specific review.
- Database grants must use a least-privilege non-owner role without BYPASSRLS; verify RLS with that exact role before production.
- Add integration tests against a disposable PostgreSQL instance and identity provider before production.
