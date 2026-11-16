# InfiniteX Permission and Approval Policy

## 1. Default-deny principle

Every action is denied unless the caller is authenticated, authorized for the target resource, and the requested tool/action is explicitly allowlisted. Tool descriptions and model-generated plans do not grant permissions.

## 2. Application authorization

- Authenticate using a trusted issuer and configured API audience.
- Use only verified token claims to establish principal identity.
- Resolve internal user and tenant mapping server-side.
- Enforce tenant and resource ownership for every read and write.
- Validate all inputs with strict schemas.
- Keep roles/scopes narrow and server-enforced.
- Do not rely on hidden UI controls as authorization.

## 3. Developer MCP permission defaults

| Action | Default |
|---|---|
| Read public docs | Allow |
| Read approved repository files | Allow within connected repo |
| Search repository code | Allow within connected repo |
| Read staging logs/schema | Explicit scope required |
| Create issue/branch or draft | Approval required |
| Commit/update repository files | Approval required |
| Merge pull request | Separate explicit approval |
| Change Auth0 tenant settings | Deny until separately approved |
| Database writes/migrations | Deny until separately approved |
| Deploy/promote/rollback | Separate explicit approval |
| DNS/domain changes | Separate explicit approval |
| Billing/plan changes | Separate explicit approval |
| Delete resources/data or rotate credentials | Deny by default; separate authorization |

## 4. Approval record

For consequential actions, record:
- exact target repository/account/project/environment;
- exact files/resources to be changed;
- proposed diff or action summary;
- expected impact and rollback plan;
- whether billing or production data may be affected;
- user's explicit approval for that specific action.

Approval for documentation-only commits does not authorize application code changes, dependency installs, migrations, deployments, account changes or production writes.

## 5. Emergency stop

Stop when target identity is ambiguous, permission scope is broader than required, a tool asks for unrelated secrets, unexpected destructive changes appear, or evidence conflicts with the plan. Report the blocker rather than improvising.
