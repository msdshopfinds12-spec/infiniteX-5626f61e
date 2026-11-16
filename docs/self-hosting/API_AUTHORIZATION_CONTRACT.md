# InfiniteX API Authentication and Authorization Contract

**Status:** Contract proposal only. No protected endpoint is currently implemented.

## 1. Handler contract

Every protected handler must receive a verified principal from trusted authentication middleware. Request body, query parameters and headers must never be used as proof of identity or role.

Conceptual TypeScript contract:

```ts
type Principal = {
  userId: string;
  identityIssuer: string;
  identitySubject: string;
  authenticatedAt: string;
  sessionId?: string;
};

type AuthorizationContext = {
  principal: Principal;
  workspaceId: string;
  resourceId?: string;
  permission: string;
  policyVersion: string;
};

type AuthorizationDecision =
  | { allowed: true; context: AuthorizationContext }
  | {
      allowed: false;
      code:
        | "UNAUTHENTICATED"
        | "WORKSPACE_MEMBERSHIP_REQUIRED"
        | "PERMISSION_DENIED"
        | "RESOURCE_NOT_FOUND";
    };
```

This is a design contract, not compiled code.

## 2. Route declaration requirements

Each route must document:
- HTTP method and path
- input schema and maximum body size
- authentication required or public
- permission identifier
- workspace scope source
- resource ownership predicate
- rate-limit profile
- idempotency requirement for retryable mutations
- audit event type
- response data classification

No route may be implemented with an implicit allow policy.

## 3. Error semantics

- 401: no valid authenticated principal.
- 403: authenticated principal lacks permission.
- 404: may be used to avoid disclosing the existence of another tenant's resource.
- 400/422: malformed or invalid input, following a consistent API convention.
- 429: rate limit exceeded.
- 5xx: generic external error with server-side correlation ID.

Do not include tokens, stack traces, SQL details, provider claims or secret configuration in responses.

## 4. Data access requirements

- Use parameterized SQL.
- Include workspace ID and membership/ownership scope in data access.
- Avoid global lookup followed by a late frontend filter.
- Ensure list, count, search, export, file download and worker operations share the same tenant policy.
- Enforce important invariants with database constraints and transactions.
- Treat cache keys as tenant-scoped.
- Record privileged mutations in an audit transaction.

## 5. Authentication boundary

OIDC callback validation must verify state, nonce, PKCE, issuer, audience, signature, expiry and allowed algorithms. The exact validation library and framework are selected only after dependency review.

The API maps the validated issuer + subject pair to a local user. Email alone is not a safe identity-link key. Provider access tokens and authorization codes must not be logged or stored without a documented need.

## 6. Human approval boundary

The following operations require a separate approval gate even for an authenticated owner:
- production deployment and public publishing
- schema migrations on persistent environments
- destructive deletion or bulk export of personal data
- payment activation, charges, refunds or payouts
- secret rotation that may interrupt production
- privileged AI tool execution, repository-wide code changes or infrastructure mutation

## 7. Observability

Every request receives a correlation ID. Security logs record decision codes and relevant non-secret identifiers only. Never log passwords, cookies, bearer tokens, authorization codes, client secrets, full request bodies or payment credentials.
