# InfiniteX Workspace Authorization Matrix

**Status:** Proposed policy contract. No authorization middleware or protected routes are implemented.

## 1. Security model

- Default deny.
- Authentication identifies the principal; authorization decides what that principal may do.
- Every workspace operation must verify active membership in the requested workspace.
- Resource ownership and workspace membership are checked server-side in the same query/transaction where practical.
- Client-supplied role, owner ID, workspace ID or permission claims are never authoritative.
- UI visibility is not a security control.

## 2. Roles

| Role | Intended scope |
|---|---|
| owner | Full workspace control, including ownership transfer and workspace deletion subject to safeguards |
| admin | Manage members and workspace configuration, but cannot transfer ownership or delete workspace unless separately granted |
| member | Create and modify ordinary workspace content allowed by product policy |
| viewer | Read-only access to explicitly readable workspace resources |

Platform operators are separate from workspace roles. There is no public self-registration as a platform operator.

## 3. Permission matrix

| Capability | owner | admin | member | viewer |
|---|---:|---:|---:|---:|
| View workspace metadata | Yes | Yes | Yes | Yes |
| View permitted workspace content | Yes | Yes | Yes | Yes |
| Create ordinary content | Yes | Yes | Yes | No |
| Update own ordinary content | Yes | Yes | Yes | No |
| Update another member's content | Yes | Policy-scoped | No by default | No |
| Delete ordinary content | Yes | Policy-scoped | Own content only, if product policy permits | No |
| Invite members | Yes | Yes | No | No |
| Change member role | Yes | Limited; cannot grant owner | No | No |
| Transfer ownership | Yes, with re-auth/confirmation | No | No | No |
| Delete workspace | Yes, with confirmation and recovery policy | No | No | No |
| View security audit events | Yes | Limited workspace events | No | No |
| Change platform-wide settings | No | No | No | No |

Any "Policy-scoped" action requires a narrower permission definition before its route is implemented. Until then, deny it.

## 4. Required policy checks

Every protected endpoint must declare:
- authentication requirement
- required permission
- workspace scope source
- resource ownership rule
- whether recent re-authentication is required
- whether human approval is required
- audit event type

The authorization service must return a structured decision: allow/deny, reason code, principal ID, workspace ID and policy version. Do not expose sensitive denial details to untrusted clients.

## 5. Tenant isolation invariants

1. A user with no active membership cannot read or mutate workspace resources.
2. A user in Workspace A cannot access Workspace B by changing a URL, request body or identifier.
3. A user cannot assign themselves a higher role.
4. Only an owner can transfer ownership.
5. The last active owner cannot be removed or demoted.
6. Membership revocation takes effect on the next authorization check.
7. Cross-workspace references are rejected unless an explicit sharing relationship is designed.
8. Every list, search, export, download and background job applies workspace scope.
9. Cached responses and job payloads must not cross tenant boundaries.
10. Background workers use an explicit service principal and workspace scope; they do not bypass authorization.

## 6. Bootstrap and recovery

Initial workspace-owner creation must use a one-time, documented bootstrap process. No hardcoded default password, public admin registration, hidden bypass route or environment-controlled permanent backdoor is permitted. Recovery of ownership requires a separately reviewed, auditable procedure.

## 7. Required negative tests

- Unauthenticated user accesses workspace route -> 401.
- Authenticated non-member accesses workspace -> 403 or privacy-preserving 404 according to API policy.
- Viewer attempts create/update/delete -> denied.
- Member attempts role assignment -> denied.
- Admin attempts ownership transfer -> denied.
- Owner removal that would leave zero owners -> transaction rejected.
- User changes resource ID to another tenant's record -> denied.
- Revoked membership followed by request -> denied.
- Background job with missing or mismatched workspace scope -> rejected.

## 8. Versioning

Changes to role meanings or permission grants require an ADR update, regression tests and explicit review. Do not silently broaden privileges.
