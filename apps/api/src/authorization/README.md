# Workspace Authorization Engine

Dependency-free, pure policy module for InfiniteX's Node.js API.

## Scope
- Evaluates a trusted principal against a trusted active workspace membership.
- Enforces role permissions and resource-owner checks.
- Provides a separate role-change policy with an explicit ownership-transfer boundary and last-owner invariant.
- Returns structured allow/deny decisions.

## Usage

```js
import { authorizeWorkspaceAction } from "./authorization/policy.mjs";

const decision = authorizeWorkspaceAction({
  principal: { userId: "user-a", active: true },
  membership: {
    userId: "user-a",
    workspaceId: "workspace-a",
    role: "member",
    status: "active",
  },
  workspaceId: "workspace-a",
  permission: "content:create",
});

if (!decision.allowed) {
  // Return a safe 403/404 response according to the API's disclosure policy.
}
```

## Critical integration requirements
- The caller MUST obtain principal and membership from trusted authentication and database layers, not request body fields.
- This module does not authenticate users, query PostgreSQL, validate OIDC tokens, or enforce transactions.
- The caller must scope database reads and writes by workspace and resource ownership.
- Role changes must run inside a database transaction with a fresh active-owner count and a concurrency-safe lock/constraint strategy.
- Ownership transfer must be a separate explicit workflow with re-authentication and audit event.
- Never trust a role supplied by a browser or mobile client.

## Tests
Run with Node.js 22 or newer:

```sh
npm run check
npm test
```
