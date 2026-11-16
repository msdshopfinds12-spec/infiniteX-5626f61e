# Free MCP Ecosystem Research for InfiniteX

Research date: 2026-11-16
Repository: msdshopfinds12-spec/infiniteX-5626f61e
Branch: feature/infiniteX-platform-integrations
Scope: public GitHub repositories, official project documentation, licenses, compatibility, security posture and fit for the current InfiniteX stack.

## Executive decision

Do not install a large collection of MCP servers. Start with the connectors already available to the development workflow, then add only the missing high-value capabilities.

Priority recommendations:
1. Keep using the existing GitHub integration; the official GitHub MCP server is an optional alternative for a separate compatible MCP host, not a duplicate that must be installed here.
2. Keep the connected Lumen catalog MCP for design-system discovery. Its diagnostics report healthy (196 web component records and 125 native component records).
3. Consider the official Auth0 MCP only for a restricted, read-only tenant inspection. It is beta software and explicitly not recommended for production-critical workloads.
4. Consider Microsoft Playwright MCP for local browser QA, or prefer Playwright CLI + skills for coding-agent workflows where lower context/tool overhead matters.
5. Consider Context7 for version-specific third-party documentation. The MIT-licensed server is open source; a free API key is recommended for higher rate limits, so do not assume unlimited hosted usage.
6. Use the official Supabase MCP only with project scoping, read-only mode and a narrow feature allowlist. Avoid production write tools.
7. Use Cloudflare's official MCP only when the project actually needs Cloudflare account operations. Begin with minimal permissions; its broad API surface can perform consequential changes.
8. Hostinger is a vendor-hosted MCP endpoint, not a GitHub-hosted source repository in this review. The Hostinger connector is not connected/exposed in this session, so account audit remains blocked.

"Free" here means the server source/package can be used under its open-source license. It does not guarantee free hosting, free provider accounts, unlimited API calls, model tokens, or zero operational cost.

## Repository and project compatibility findings

### InfiniteX current frontend

Verified from the active branch:
- React: ^18.3.1
- React DOM: ^18.3.1
- TypeScript: ^5.6.3
- Vite: ^5.4.10
- Root package manager: npm; package-lock.json exists.
- Root scripts: dev, build, preview, lint.
- No root test script is defined.
- Auth0 React SDK and Lumen React are not installed.

### Critical Lumen compatibility correction

The current Lumen React catalog snapshot is version 5.0.0. Its published package metadata declares:
- peer dependency react >=19
- peer dependency motion ^14.0.0

The InfiniteX app currently uses React 18.3.1. Therefore, installing Lumen React v5 directly into the current app is **not compatible** and must not be done as a routine dependency addition.

The previously inspected Lumen component contracts (Message, MessageScroller, PromptComposer, StreamMessage, Avatar and Bubble) are useful design/API references, but their existence in the catalog does not establish compatibility with this React 18 consumer.

Safe options:
A. Keep React 18 and use the current app primitives / a React-18-compatible accessible component library while the design is prepared.
B. Plan a separate React 19 migration, first checking all current dependencies, Vite plugin compatibility, type packages, test runner and app behavior; only then add Lumen React v5 and motion, regenerate package-lock.json, and verify.
C. Investigate the Lumen Elements adapter as a separate Web Components integration only after reviewing its React embedding contract and package dependencies. Do not assume it bypasses every compatibility concern.

Recommendation: do not combine a React major upgrade, Auth0 integration and chat rewrite in one unreviewed change. Keep each as a separate reversible feature slice.

## Shortlisted open-source MCP servers

### 1. Official GitHub MCP Server
- Repository: https://github.com/github/github-mcp-server
- License: MIT
- Purpose: repository browsing, code search, pull requests, issues, Actions and workflow intelligence.
- Fit: high for engineering automation.
- Status in this workflow: GitHub access is already connected. Do not add a second GitHub MCP unless a separate MCP host requires it.
- Security: grant only the repository permissions needed; prefer read-only toolsets for audit tasks. A write-capable token can create or modify repository content.
- Cost: source is MIT; GitHub account/API policies and rate limits still apply.

### 2. Official Auth0 MCP Server
- Repository: https://github.com/auth0/auth0-mcp-server
- License: MIT
- Purpose: inspect and manage Auth0 tenant applications, actions and logs.
- Fit: high for Auth0 setup/audit, but not required for ordinary application runtime authentication.
- Important maturity warning: the repository labels the server beta and says it is not recommended for production or critical workloads.
- Safe initial mode from its documented CLI:
  
      npx @auth0/auth0-mcp-server run --read-only --tools 'auth0_list_*,auth0_get_*'

- Use read-only mode; do not initialize write scopes or allow create/update/delete tools for the first audit.
- Status: public repository found; no Auth0 MCP connection is currently exposed in this session.

### 3. Microsoft Playwright MCP
- Repository: https://github.com/microsoft/playwright-mcp
- License: Apache-2.0
- Package: @playwright/mcp
- Purpose: browser automation using accessibility snapshots for UI smoke tests and exploratory QA.
- Fit: high for InfiniteX mobile/responsive and login-flow verification once a local test environment exists.
- Runtime: repository package currently declares Node >=18; browser binaries and local environment may add storage/runtime requirements.
- Important upstream recommendation: its README says coding agents may benefit from Playwright CLI + skills because CLI calls can be more token-efficient; MCP remains useful for stateful browser exploration.
- Safe use: local/staging test environment only; do not expose production credentials or perform real account actions.
- Status: candidate only; not installed.

### 4. Context7
- Repository: https://github.com/upstash/context7
- License: MIT
- Purpose: retrieve current, version-specific library documentation and examples.
- Fit: high for reducing outdated API assumptions across React, Vite, Hono, Zod and provider SDKs.
- Cost note: the README recommends a free API key for higher rate limits; quotas still apply.
- Alternative: official docs and package READMEs can be consulted manually without another MCP.
- Status: candidate only; not installed.

### 5. Official Supabase MCP
- Repository: https://github.com/supabase/mcp
- License: Apache-2.0
- Endpoint: https://mcp.supabase.com/mcp
- Purpose: project-scoped Supabase documentation, database, debugging and platform operations.
- Fit: high only if InfiniteX confirms Supabase as its active backend.
- Safety: use a specific project reference, read-only mode and the smallest feature set (start with docs/database read access); keep cost confirmation enabled; never expose service-role keys or unrestricted database credentials.
- Status: repository/docs verified; no MCP connection action taken here. Existing Supabase application integration is available separately in this ChatGPT environment.

### 6. Official Cloudflare API MCP
- Repository: https://github.com/cloudflare/mcp
- License: Apache-2.0
- Endpoint: https://mcp.cloudflare.com/mcp
- Purpose: Cloudflare API and developer documentation through a compact Code Mode interface.
- Fit: medium-high if InfiniteX selects Workers, D1, R2, DNS or Cloudflare AI services.
- Safety: this is broad account API access. Use narrow OAuth scopes or a narrowly scoped API token; start with documentation and read operations. Do not grant DNS, Worker deployment, billing or destructive permissions by default.
- Token efficiency: upstream reports about 1k tokens for its Code Mode interface versus very large native schema exposure. This is a source-reported comparison, not a promise of unlimited tokens.
- Status: candidate only; do not duplicate the existing Cloudflare connector unless a separate host needs it.

### 7. Cloudflare product-specific MCP collection
- Repository: https://github.com/cloudflare/mcp-server-cloudflare
- License: Apache-2.0
- Purpose: focused Cloudflare product servers, including documentation, browser rendering and other product-specific tasks.
- Fit: medium; use a focused endpoint rather than enabling broad API access when the task is narrow.
- Warning: the README identifies several older product-specific endpoints as deprecated in favor of the main Cloudflare API MCP. Verify the exact server before connecting.

### 8. CrystalDBA Postgres MCP
- Repository: https://github.com/crystaldba/postgres-mcp
- License: MIT
- Purpose: PostgreSQL schema/query inspection, explain plans and database health/performance analysis.
- Fit: medium for DB engineering, but it is a third-party database MCP with potentially powerful SQL access.
- Safety: if evaluated, use only a disposable local/staging database and a dedicated read-only database role. Do not configure unrestricted access against production.
- Recommendation: prefer official Supabase MCP for a Supabase-hosted project; keep this as a later specialist option.

## Existing connectors and missing integrations

| System | Current evidence | Decision |
|---|---|---|
| GitHub | Connected GitHub repository integration | Keep; no duplicate MCP needed |
| Lumen | Connected catalog MCP; diagnostics healthy | Keep; correct React compatibility before package adoption |
| Auth0 | Auth0 skill available; official MCP repo found; no live Auth0 tenant integration verified | Optional restricted read-only MCP |
| Hostinger | Official endpoint documented: https://mcp.hostinger.com; connector tools not exposed in this session | User must connect it; audit read-only first |
| Supabase | Official MCP found; separate Supabase app integration is available in this environment | Prefer project-scoped read-only access |
| Cloudflare | Official MCP found; separate Cloudflare app integration is available in this environment | Avoid duplicate broad account permissions |
| Playwright | Official MCP found | Add only for local/staging browser QA |
| Context7 | MIT repo found | Optional documentation helper |

## MCP architecture recommendation for InfiniteX

Keep MCP as a developer/agent integration layer, not as a browser-side feature.

    Developer / Coding Agent
      ├── GitHub connector (existing)
      ├── Lumen catalog MCP (existing)
      ├── Auth0 MCP (optional, read-only beta)
      ├── Playwright (local QA)
      ├── Context7 (docs lookup)
      └── Supabase / Cloudflare (only if selected backend/hosting)

    InfiniteX React Client
      └── Auth0 SDK -> HTTPS -> InfiniteX Hono API

    InfiniteX Hono API
      ├── Authentication and authorization
      ├── Explicit allowlisted application tools
      ├── Zod input/output validation
      ├── Per-user and per-tool quotas
      ├── Timeouts and cancellation
      ├── Approval gate for consequential actions
      └── Audit records with secrets redacted

Do not ship MCP credentials to the browser. Do not let a model choose arbitrary URLs, SQL, shell commands or account-level API actions. Each exposed tool needs a fixed schema, resource scope, authorization check, timeout, output limit and audit event.

## Recommended adoption order

1. No installation: document the approved MCP inventory and keep current GitHub/Lumen connectors.
2. Correct the Lumen React 5 / React 18 incompatibility decision.
3. Connect Hostinger official MCP through ChatGPT connector settings and run a read-only audit.
4. If Auth0 tenant inspection is needed, evaluate official Auth0 MCP in read-only mode only.
5. Add Playwright for local/staging browser QA when the app can be run.
6. Add Context7 only if documentation lookup is a recurring bottleneck.
7. Add Supabase or Cloudflare MCP only after the backend/hosting decision is confirmed.

## Approval and safety gates

- This report is research and architecture documentation only.
- No MCP server was installed or connected.
- No Auth0 tenant, Hostinger account, Supabase project or Cloudflare account was modified.
- No .env, API token, password, service-role key or client secret was read or written.
- No dependency was installed and no lockfile was changed.
- No database migration, deployment, DNS change, purchase, merge or production write was performed.

Before any integration: confirm the target project/account, inspect the exact tool schemas and permission scopes, select read-only mode where possible, and obtain approval before writes or billable operations.


---

## 2026-11-16 official installation cross-check

The current official Playwright getting-started documentation specifies Node.js 20 or newer and a compatible MCP client. The Playwright repository README may show a broader package engine requirement in some versions; use the stricter official setup-doc prerequisite (Node 20+) for a conservative setup. InfiniteX API package itself specifies Node >=22, so Node 22 is the practical common baseline for this repository.

Playwright MCP official setup:
- Docs: https://playwright.dev/docs/getting-started-mcp
- Repository: https://github.com/microsoft/playwright-mcp
- Standard client configuration:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

Playwright CLI alternative:
- Repository: https://github.com/microsoft/playwright-cli
- Upstream describes CLI + skills as potentially more token-efficient for coding agents than loading a large MCP tool schema and accessibility tree. Use CLI when concise repeatable commands are preferred; use MCP for stateful browser exploration.

Chrome DevTools MCP alternative:
- Repository: https://github.com/ChromeDevTools/chrome-devtools-mcp
- Official setup: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/client-configurations.md
- Example:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"]
    }
  }
}
```

It requires Node.js LTS, npm and current Chrome. It can inspect and modify the connected browser context; do not attach a browser profile containing unrelated sensitive accounts.

## Best-fit decision

- First optional MCP to consider: Context7, because it supports current/version-specific documentation lookup and does not require InfiniteX production credentials.
- First browser QA option: Playwright CLI for a coding-agent workflow; Playwright MCP if persistent interactive browser state is needed. Chrome DevTools MCP is an alternative when Chrome network/performance diagnostics are the priority.
- Do not install all browser options. Pick one based on the actual coding host and test workflow.
- Android note: local `npx` setup requires Node.js and a compatible MCP client. A GitHub repository link is source code, not an Android APK or one-tap ChatGPT Android installation.

No installation or account connection was performed during this research update.
