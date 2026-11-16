# InfiniteX Threat Model

**Status:** Initial source-informed threat model; requires review before production release.

## 1. Assets

- User identities and access tokens.
- Tenant records, agents, tasks and AI usage.
- Prompt and response content.
- AI provider credentials and database credentials.
- Repository source, CI secrets and deployment credentials.
- Audit events and operational logs.

## 2. Trust boundaries

1. Browser to API over HTTPS.
2. API to identity provider JWKS endpoint.
3. API to PostgreSQL connection pool.
4. API to external AI provider.
5. Developer agent to MCP server and external account APIs.
6. CI runner to repository and deployment credentials.

## 3. Threats and mitigations

| Threat | Impact | Required controls |
|---|---|---|
| Forged/expired token | Unauthorized API access | Signature, issuer, audience, algorithm and time-claim validation |
| Cross-tenant IDOR | Data exposure/modification | Tenant-scoped repository queries, RLS, authorization tests |
| RLS bypass through DB role | Cross-tenant access | Dedicated least-privilege app role; verify owner/BYPASSRLS status |
| Prompt injection | Unauthorized tool use or data leakage | Treat prompts/tool outputs as untrusted; fixed tools and policy checks |
| MCP over-permission | Account/repo/infra modification | Read-only scopes, allowlists, approval gates |
| Secret leakage | Account compromise | Secret manager, redaction, no browser exposure, no committed .env |
| SSRF via tool/provider URL | Internal service access | Egress allowlist, URL validation, block private/metadata destinations |
| Resource exhaustion | Service outage/cost spike | Body limits, quotas, timeouts, concurrency caps, output ceilings |
| Duplicate task execution | Repeated side effects | Idempotency keys, worker leases, idempotent handlers |
| Malicious package update | Supply-chain compromise | Lockfiles, version review, provenance, dependency audit |
| Unsafe HTML rendering | Script execution / UI compromise | Text rendering or vetted sanitizer; never trust raw model HTML |
| Sensitive logging | Data disclosure | Structured logs, payload minimization, token/secret redaction |

## 4. High-priority findings to validate

- Task route explicitly states no worker is configured; queued tasks are not executed by the code path shown.
- Migration uses forced RLS on several tables, but actual protection depends on the connected database role and must be tested.
- Tenant context is set transaction-locally; pooled-connection leakage and rollback behavior need integration tests.
- Idempotency conflict handling should verify that a repeated key represents the same request before returning an existing task.
- AI provider usage persistence can fail after provider execution; reconciliation behavior is required.
- No application-side MCP gateway was verified; do not expose MCP tools directly to end users.

## 5. Residual risk

This is a design review, not a penetration test. No live database, deployed API, browser session, provider account or production MCP server was tested. Risk ratings remain provisional until evidence is collected.
