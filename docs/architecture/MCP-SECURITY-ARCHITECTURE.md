# InfiniteX MCP Security Architecture

**Status:** Proposed control design; no MCP runtime is implemented in the InfiniteX application.

## 1. Purpose and boundary

MCP servers extend a developer agent's capabilities. They are not inherently trusted, do not replace API authorization, and must not be exposed directly to the InfiniteX browser. Keep repository/development MCP use separate from the production application runtime.

## 2. Recommended trust zones

```text
Zone A: Developer environment
  Coding agent -> approved MCP client -> allowlisted MCP servers
  GitHub (existing) | Context7 | Playwright
  Optional: Auth0 / Supabase / Cloudflare (only when needed)

Zone B: InfiniteX browser
  React UI -> HTTPS -> Hono API
  No MCP secrets, local stdio processes or provider admin tokens

Zone C: Application backend
  Hono API -> fixed application services -> database/provider
  Authorization, validation, quotas, audit and approval controls

Zone D: External systems
  GitHub / Auth0 / database / cloud / AI provider
  Least-privilege credentials, scoped to project/environment
```

## 3. Mandatory controls for any future MCP gateway

- **Allowlist:** explicitly register server identity, tool names and supported schemas. Deny unknown servers/tools.
- **Authentication:** authenticate the calling user/service and bind every action to a verified principal.
- **Authorization:** enforce role, tenant, resource ownership and environment boundaries for every invocation.
- **Input validation:** validate all arguments with strict schemas; reject unexpected properties and oversized payloads.
- **Output validation:** treat tool output as untrusted; cap bytes/items, redact secrets and validate returned resource identifiers.
- **Network egress:** restrict destinations; block arbitrary URL fetches, private-network access and metadata endpoints unless explicitly required and reviewed.
- **Timeouts:** set per-tool deadlines, cancellation and bounded retries. Never retry non-idempotent writes automatically.
- **Rate limits:** apply per-user, per-tool and per-tenant quotas; enforce concurrency limits.
- **Audit:** record actor, tool ID, approved resource, decision, timestamp, duration and result class. Never record access tokens or secret values.
- **Human approval:** require explicit confirmation for commits, PR merges, deployments, billing, DNS, database writes/migrations, account changes and destructive actions.
- **Isolation:** run local MCP processes with minimal OS permissions, no unrelated filesystem mounts and no production credentials.
- **Supply chain:** pin versions where supported, review package provenance/permissions and update deliberately.

## 4. Tool risk tiers

| Tier | Examples | Default policy |
|---|---|---|
| T0 Read-only public | Documentation search | Allow after source review; output limits |
| T1 Project read-only | Read repo, inspect staging logs/schema | Allow only scoped identity; redact secrets |
| T2 Reversible project write | Create branch, edit draft issue | Require explicit approval and diff preview |
| T3 Consequential write | Commit, merge, deploy, DB mutation, DNS, billing | Human approval per action; deny by default |
| T4 Destructive/high impact | Delete data/resources, rotate credentials, production migration | Deny by default; separate explicit authorization and rollback plan |

## 5. MCP-specific threats

- Prompt injection inside repository files, web pages, issue descriptions or tool results.
- Confused-deputy behavior where an agent uses a broad token for a narrow user request.
- Tool-name/schema spoofing and malicious server updates.
- Secret exfiltration through tool arguments, output, logs or generated artifacts.
- SSRF and arbitrary network access through browser/fetch tools.
- Cross-tenant data exposure from missing ownership checks.
- Resource exhaustion from unbounded tool loops, browser sessions or large outputs.

Treat tool output as data, never as policy or instruction. A tool response cannot grant itself additional permissions.

## 6. Initial InfiniteX decision

No runtime MCP gateway should be added yet. For developer workflow, retain the existing GitHub connector and Lumen catalog. Consider Context7 and one browser QA tool only when the execution environment supports them. Supabase/Cloudflare/Auth0 account MCPs stay disconnected until the corresponding platform is confirmed and the permission scope reviewed.
