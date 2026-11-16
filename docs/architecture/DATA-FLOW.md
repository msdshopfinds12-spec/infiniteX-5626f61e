# InfiniteX Data Flow and Trust Boundaries

**Status:** Source-derived flow map; runtime traffic has not been captured.

## 1. Authentication and API request

1. A user authenticates through the configured identity provider once a UI integration is implemented.
2. The client requests an API access token for the configured API audience.
3. The browser sends the token in the HTTPS Authorization bearer header.
4. Hono middleware validates signature via trusted JWKS, issuer, audience and allowed RS256 algorithm; jose validates standard time claims.
5. The API stores the verified issuer and subject in request context.
6. Protected route handlers validate request bodies with Zod.
7. Repository functions resolve the internal user/tenant mapping and execute operations in a tenant transaction.
8. The API returns a bounded response; sensitive values and credentials are never returned.

**Important:** The backend auth middleware exists, but successful browser login and live issuer/JWKS configuration have not been demonstrated.

## 2. AI generation flow

```text
Browser prompt
  -> authenticated POST /api/v1/ai/generate
  -> body schema validation (prompt length/output token ceiling)
  -> user rate limit
  -> tenant mapping check when database is configured
  -> configured AI provider adapter
  -> timeout + bounded output tokens
  -> usage persistence (when DB configured)
  -> response to client
```

The provider adapter uses an OpenAI-compatible chat-completions endpoint. No claim is made that a provider is configured or that a request has succeeded. If the provider succeeds but usage persistence fails, reconciliation may be needed; this failure mode must be tested and documented.

## 3. Task flow

```text
POST /api/v1/tasks
  -> JWT auth + rate limit
  -> strict Zod schema
  -> tenant transaction
  -> insert task with idempotency key
  -> return queued record with execution=no_worker_configured
```

The source explicitly indicates that no worker is configured. A queued task must not be presented as running or completed. A future worker needs atomic claim/lease semantics, bounded retries, idempotent execution, cancellation race handling and dead-letter observability.

## 4. Database trust boundary

- Tenant identity is resolved from the verified issuer + subject mapping.
- The transaction helper sets `app.tenant_id` transaction-locally.
- Migration enables and forces RLS on agents, tasks, ai_usage and audit_events.
- RLS behavior depends on actual database role ownership/bypass privileges and connection/transaction behavior. Test with the exact production application role; do not infer safety from policy SQL alone.
- The migration has not been applied or verified in a live database in this review.

## 5. MCP developer-tool flow

MCP tool calls belong to the developer environment and must not be routed through the end-user browser. The agent must use allowlisted tools, project-scoped credentials, output redaction and human approval for writes. Repository text and remote page content are untrusted.

## 6. Data classification

| Class | Examples | Handling |
|---|---|---|
| Public | Public docs, open-source package metadata | May be retrieved and cited |
| Project internal | Source code, architecture docs, CI logs | Authorized repo access; avoid unnecessary disclosure |
| User data | Prompts, conversations, task inputs/results | Tenant isolation, least privilege, retention policy |
| Secrets | API keys, DB URLs/passwords, refresh/access tokens | Secret manager only; never commit/log/display |
| Operational metadata | Request IDs, usage counts, audit events | Minimize identifiers; redact payloads and credentials |

## 7. Unverified runtime facts

No production request traces, database connection tests, Auth0 login traces, task worker logs, or live MCP gateway traffic were captured. Treat the flows above as source-derived intended behavior, not proof of deployment.
