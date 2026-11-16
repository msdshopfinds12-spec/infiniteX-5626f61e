# MCP Integration Status

**Reviewed:** 2026-11-16  
**Repository:** `msdshopfinds12-spec/infiniteX-5626f61e`  
**Branch:** `feature/infiniteX-platform-integrations`

## Status legend

- **VERIFIED:** directly observed in repository or official project documentation.
- **PARTIAL:** some setup/evidence exists; end-to-end behavior is incomplete.
- **NOT CONNECTED:** candidate exists but is not installed/connected in this workflow.
- **BLOCKED:** dependency, permission, platform decision or environment is missing.
- **NOT TESTED:** no execution evidence.

## Inventory

| MCP / connector | Evidence | Decision | Status |
|---|---|---|---|
| GitHub connector | Existing GitHub repository access used for source inspection | Keep; avoid duplicate server | VERIFIED connected |
| Lumen catalog | Existing catalog integration and prior healthy diagnostics | Keep as design reference; React package compatibility still blocks v5 adoption | PARTIAL |
| Context7 | Official MIT repository and hosted docs found | Optional documentation lookup | NOT CONNECTED |
| Microsoft Playwright MCP | Official Apache-2.0 repository and install instructions found | Candidate for local/staging browser QA | NOT CONNECTED |
| Chrome DevTools MCP | Official Apache-2.0 repository and install instructions found | Alternative/complement to Playwright; do not install both by default | NOT CONNECTED |
| Auth0 MCP | Official repository found; beta/read-only caveat documented | Only if tenant audit is needed; read-only | NOT CONNECTED |
| Supabase MCP | Official Apache-2.0 repository/endpoint found | Only after confirming Supabase as selected backend | NOT CONNECTED |
| Cloudflare MCP | Official Apache-2.0 repository/endpoint found | Only after confirming Cloudflare as selected hosting/backend | NOT CONNECTED |
| Postgres MCP | Third-party MIT repository found | Later, only with dedicated read-only DB role | NOT CONNECTED |
| Official GitHub MCP server | Official MIT repository found | Redundant while existing GitHub connector works | NOT NEEDED |
| Hostinger MCP | Official hosted endpoint previously documented; no connector tools exposed in this session | Connect through supported connector settings, read-only audit first | BLOCKED |

## Recommended minimal stack

1. Keep GitHub connector already connected.
2. Optional: Context7 for versioned library docs.
3. Choose **one** browser automation tool:
   - Playwright MCP for persistent exploratory browser sessions, or
   - Playwright CLI + skills for concise coding-agent workflows, or
   - Chrome DevTools MCP for Chrome-specific performance/network debugging.
4. Do not add Supabase, Cloudflare or Auth0 account MCP until the actual target platform/tenant is confirmed.
5. Never put MCP secrets in Vite/browser variables.

## Free/open-source caveat

Open-source licenses allow use under their terms; they do not guarantee free hosted quotas, compute, browser downloads, model tokens, API requests, account plans or unlimited use. Confirm each provider's current pricing and usage limits before connecting or running it.

## Official repositories

- Context7: https://github.com/upstash/context7
- Playwright MCP: https://github.com/microsoft/playwright-mcp
- Playwright CLI: https://github.com/microsoft/playwright-cli
- Chrome DevTools MCP: https://github.com/ChromeDevTools/chrome-devtools-mcp
- Auth0 MCP: https://github.com/auth0/auth0-mcp-server
- Supabase MCP: https://github.com/supabase/mcp
- Cloudflare MCP: https://github.com/cloudflare/mcp
- Postgres MCP: https://github.com/crystaldba/postgres-mcp
- GitHub MCP: https://github.com/github/github-mcp-server

## Installation examples (compatible local MCP client required)

### Context7

Official documentation: https://context7.com/docs/installation

```bash
npx ctx7 setup
```

The hosted endpoint documented by Context7 is `https://mcp.context7.com/mcp`. Basic setup supports OAuth; API keys may be relevant to higher rate limits. Review current quota terms.

### Playwright MCP

Official setup: https://playwright.dev/docs/getting-started-mcp

Requires Node.js 20+ and an MCP-compatible client. Example config:

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

Browser binaries may be downloaded on first use and consume storage. Use only local/staging test targets and isolated sessions for QA.

### Chrome DevTools MCP (alternative)

Official setup: https://github.com/ChromeDevTools/chrome-devtools-mcp

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

Requires Node.js LTS, npm and a current Chrome installation. It can inspect and modify the connected browser context; never connect a browser session containing unrelated sensitive accounts.

### Supabase / Cloudflare

- Supabase endpoint: https://mcp.supabase.com/mcp
- Cloudflare endpoint: https://mcp.cloudflare.com/mcp

Do not connect either until platform selection is confirmed. Start with read-only, project-scoped access and a narrow feature/tool allowlist.

## Device limitation

These local `npx` examples require Node.js and a compatible MCP host. Opening a GitHub repository link on an Android phone does not install an MCP server. Do not assume the ChatGPT Android app can run arbitrary local stdio servers. Use a supported coding environment, or a hosted connector explicitly supported by the client.

## Execution record

No MCP server was installed, launched or connected as part of this documentation change. No external account permissions were changed.


---

## Additional free/open-source candidates reviewed — 2026-11-16

| Candidate | Repository / install | Fit for InfiniteX | Recommendation |
|---|---|---|---|
| MCP Inspector | https://github.com/modelcontextprotocol/inspector · `npx @modelcontextprotocol/inspector` | Inspect/test MCP tool schemas and protocol behavior | Useful developer QA utility; not a production app dependency |
| DBHub | https://github.com/bytebase/dbhub · `npx @bytebase/dbhub@latest` | PostgreSQL schema and query diagnostics; read-only mode, row limits and query timeouts | Better candidate than a broad DB admin MCP for a later read-only DB audit; only with dedicated read-only DB role |
| Filesystem MCP | https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem · `npx -y @modelcontextprotocol/server-filesystem <allowed-directory>` | Local source/document access | Optional only in a supported local coding host; allowlist one workspace and use read-only mode for audits |
| Playwright E2E MCP (third party) | https://github.com/xsignon-secure/E2E | Runs and diagnoses Playwright tests; project claims MIT/no account | Experimental alternative; review source, package provenance and permission behavior before use. Not required if using official Playwright MCP/CLI |
| Sigil | https://github.com/sigildev/sigil | Static source analysis for MCP server implementations | Experimental, very new/small project; do not treat its score as proof of safety |

The official MCP Inspector offers web, CLI and TUI inspection modes. It is a testing utility for MCP servers, not an InfiniteX runtime dependency. DBHub documents read-only mode, row limits and query timeouts; do not connect it to a live database using an owner/admin credential. The official Filesystem server supports explicit allowed-directory scoping; never grant it the whole device filesystem. References: https://github.com/modelcontextprotocol/inspector, https://github.com/bytebase/dbhub, https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem.

### Deprecated or avoid

- `semgrep/mcp` standalone repository is archived and says the MCP implementation moved into the main Semgrep project. Do not install the archived standalone package. Use Semgrep's current official CLI/integration only after checking current terms and supported setup: https://github.com/semgrep/mcp.
- Do not add an MCP just because it is popular. Each server expands the trust boundary and tool surface.
- MCP Inspector does not certify a server as secure. A successful protocol test is not a security audit.

### Minimal install set — final recommendation

For InfiniteX today, **install zero new MCP servers until the coding host and runtime environment are confirmed**. Existing GitHub connector already covers repository operations. When a supported Node 22 coding host is available, the first optional tools to evaluate are Context7 and MCP Inspector. For browser QA, choose one of Playwright MCP or Playwright CLI. For a database audit later, choose DBHub in strict read-only mode. Keep cloud/account MCPs disconnected until the target provider is confirmed.

Open-source software can be free to install while hosted services, compute, storage, model usage or API quotas remain metered. This list is not a promise of unlimited free usage.
