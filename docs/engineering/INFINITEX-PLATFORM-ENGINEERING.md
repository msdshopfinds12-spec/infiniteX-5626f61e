# InfiniteX Platform Engineering Blueprint

Status: **PLAN / DOCUMENTATION BASELINE**  
Target: React + TypeScript + Vite frontend; Hono + Node.js API; PostgreSQL when configured.  
Branch: feature/infiniteX-platform-integrations

## 1. Engineering guardrails

This blueprint is additive documentation. It does not install dependencies, configure third-party tenants, provision infrastructure, migrate databases, or deploy.

Required delivery sequence:

1. INSPECT current source, branch, dependencies, runtime and environment contracts.
2. PLAN architecture, data flows, threat model and acceptance criteria.
3. APPROVE each external account, cost-bearing or destructive action.
4. BUILD the smallest complete vertical slice.
5. TEST with reproducible unit, integration, browser and security checks.
6. AUDIT accessibility, authorization, secrets, cost controls and operational readiness.
7. DOCUMENT evidence and obtain release approval.

Never represent demo fixtures, static metrics, mocks or unexecuted checks as live or verified.

## 2. System architecture

```text
Mobile / Desktop Browser
  -> React + TypeScript + Lumen UI
  -> Auth0 Universal Login (OIDC Authorization Code + PKCE)
  -> API client obtains API access token
  -> Hono API (Node.js)
       -> request ID, security headers, CORS allowlist, body limits
       -> jose JWT verification (issuer, audience, signature, exp, nbf, algorithm)
       -> authorization policy (subject + resource ownership)
       -> Zod request validation
       -> conversation / message service
       -> AI provider adapter (bounded timeout and output)
       -> PostgreSQL repository (parameterized SQL)
       -> usage ledger / quotas / audit events
  -> provider-neutral AI adapter
```

### Trust boundaries

- Browser code is public. Never put Auth0 client secrets, AI provider keys, database credentials, or private signing keys in Vite variables.
- A valid JWT proves identity and token claims; it does not grant ownership of arbitrary conversation IDs.
- Derive the actor identity from the verified access token's `sub`. Never trust a browser-supplied user ID.
- Enforce resource ownership in every repository query and service operation.
- Treat AI output, user prompts, uploaded content and tool output as untrusted data.
- Do not allow model output to directly execute shell commands, SQL, deployments, or account mutations.

## 3. Frontend architecture

Keep the current dashboard intact until its actual routes and user requirements are reviewed. Build chat as a separate feature slice rather than replacing the dashboard blindly.

Suggested target structure:

```text
src/
  app/
    providers/
      AuthProvider.tsx
      ThemeProvider.tsx
    router/
    config/
  auth/
    auth-config.ts
    auth-types.ts
    use-auth.ts
  components/
    layout/
      AppShell.tsx
      MobileNavigation.tsx
    chat/
      ConversationList.tsx
      MessageList.tsx
      MessageItem.tsx
      MessageComposer.tsx
      StreamingMessage.tsx
    feedback/
      ErrorState.tsx
      EmptyState.tsx
      LoadingState.tsx
  features/
    conversations/
    chat/
    settings/
    usage/
  services/
    api-client.ts
    conversation-service.ts
    chat-service.ts
  types/
  utils/
  styles/
```

Rules:
- Feature components own presentation; services own transport; API owns authorization and persistence.
- Keep transport types separate from UI state.
- Model loading, empty, success, error, cancellation and retry states explicitly.
- Use stable message IDs; do not use array indexes as keys.
- Render model text as text/Markdown through a safe renderer. Never inject raw HTML from model output.
- Mobile navigation must have a usable drawer/sheet, focus management and Escape handling.
- Streaming announcements should avoid announcing every token to assistive technology.

## 4. Lumen UI integration contract

Package candidate from the component catalog: `@santi020k/lumen-react`. This package is **not yet installed**; verify its published version, React peer dependencies, lockfile impact and license before installation.

Known React component contracts from the Lumen catalog:

```tsx
import { Message, Avatar, Bubble, PromptComposer, Sidebar }
  from "@santi020k/lumen-react";
import "@santi020k/lumen-react/styles.css";

<Message from="assistant">
  <Avatar>AI</Avatar>
  <Bubble>Assistant message content</Bubble>
</Message>

<PromptComposer
  label="Message InfiniteX"
  maxLength={4000}
  value={draft}
  onValueChange={setDraft}
  onPromptSubmit={({ text }) => sendMessage(text)}
  pending={isPending}
  onStop={cancelRequest}
/>

<Sidebar>
  <a href="/chat">New chat</a>
  <a href="/settings">Settings</a>
</Sidebar>
```

Lumen's `PromptComposer` owns the input surface and emits submit/stop events; application code owns the network request and AbortController. Do not assume it cancels HTTP requests automatically. Confirm any additional component APIs from the live catalog before use.

## 5. Auth0 integration contract

Frontend:
- Use the Auth0 React SDK for the React SPA.
- Configure Authorization Code Flow with PKCE through the SDK.
- Use the configured API audience when requesting access tokens.
- Prefer in-memory token handling; do not persist access tokens in localStorage.
- Keep client ID and domain as public configuration only. Never embed a client secret in the SPA.
- Login, logout, callback and allowed web origins must be explicitly configured in the Auth0 application.

Backend:
- Reuse the existing `jose`-based verifier after inspecting its current implementation.
- Validate signature, issuer, audience, expiry, not-before and allowed signing algorithm.
- Require an API access token, not an ID token.
- Fail closed when production issuer/audience/JWKS configuration is missing.
- Authorization is a separate policy check after authentication.

Environment variable names (server-side unless marked public):
- `VITE_AUTH0_DOMAIN` (public)
- `VITE_AUTH0_CLIENT_ID` (public)
- `VITE_AUTH0_AUDIENCE` (public API identifier)
- `AUTH_ISSUER_URL` (server)
- `AUTH_AUDIENCE` (server)
- `AUTH_JWKS_URL` (server)

Never commit real values. Add only placeholders to an example file after confirming the repository's env conventions.

## 6. Backend API target

Proposed endpoints (not yet implemented or verified):

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/health | Liveness/readiness split |
| GET | /api/v1/conversations | List only current user's conversations |
| POST | /api/v1/conversations | Create conversation |
| GET | /api/v1/conversations/:id | Read owned conversation |
| DELETE | /api/v1/conversations/:id | Delete owned conversation, after product approval |
| GET | /api/v1/conversations/:id/messages | Paginated messages |
| POST | /api/v1/chat | Start bounded generation/stream |
| POST | /api/v1/chat/:requestId/cancel | Cancel active generation |
| GET | /api/v1/usage | Current user's usage summary |

Implementation requirements:
- Validate path IDs, query parameters and JSON bodies with Zod.
- Use cursor pagination with deterministic ordering.
- Apply per-user and per-IP rate limits; process-local counters are not sufficient for horizontally scaled production.
- Use database transactions for message persistence and usage accounting.
- Make request IDs idempotent where retries could duplicate charges or messages.
- SSE: set correct headers, flush bounded chunks, handle disconnects, propagate AbortSignal, and never leak another user's events.
- Do not persist partial assistant messages as complete responses without an explicit status field.

## 7. Data model target

Conceptual tables; migration must be separately reviewed and approved:

- users: internal ID, Auth0 subject (unique), created_at
- conversations: id, owner_user_id, title, created_at, updated_at
- messages: id, conversation_id, role, content, status, created_at
- generation_requests: id, owner_user_id, conversation_id, status, provider, model, started_at, finished_at
- usage_ledger: id, owner_user_id, request_id (unique), input_tokens, output_tokens, estimated_cost, created_at
- audit_events: id, actor_subject, action, resource_type, resource_id, outcome, created_at

Security:
- Foreign keys and indexes on ownership / pagination paths.
- Parameterized SQL only.
- Row Level Security is defense-in-depth, not a substitute for server authorization.
- Use a least-privilege database role.
- Never log prompt content, tokens or secrets by default.
- Define retention and deletion policy before launch.

## 8. AI provider, token and cost controls

Unlimited tokens cannot be guaranteed by Railway, Hostinger or the application. Provider quotas, context windows, rate limits and pricing remain authoritative.

Required controls:
- Maximum input bytes and characters.
- Maximum output tokens per request.
- Per-user request and token budgets.
- Global daily/monthly spend ceiling with a hard-stop mode.
- Provider timeout, bounded retries with jitter, and circuit breaker.
- Model allowlist and fallback policy.
- Usage ledger with estimated cost and reconciliation status.
- User-visible usage disclosure; never imply a quota is unlimited.

Provider adapter interface:

```ts
export type GenerateInput = {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  model: string;
  maxOutputTokens: number;
  signal?: AbortSignal;
};

export type GenerateResult = {
  content: string;
  inputTokens?: number;
  outputTokens?: number;
  providerRequestId?: string;
};

export interface AIProvider {
  generate(input: GenerateInput): Promise<GenerateResult>;
}
```

Provider adapters must validate response shape, enforce timeouts and normalize errors. Do not expose provider keys to the browser.

## 9. Hostinger deployment architecture

Hostinger is a possible deployment target, not a confirmed compatible target until its hosting plan/runtime is inspected.

Before choosing a target:
1. Identify hosting product and supported Node.js version/process model.
2. Confirm persistent process, port binding, environment variable and log support.
3. Confirm TLS, domain and reverse-proxy behavior.
4. Confirm deployment rollback and backup options.
5. Compare monthly costs and free alternatives before enabling paid resources.

Possible deployment shapes:
- Static React frontend on static hosting; Hono API on a supported Node.js app host.
- Single Node.js service serving built SPA assets and API routes, only if Hostinger plan supports it.
- Keep PostgreSQL on a managed database with TLS and backups; do not assume shared hosting includes a suitable database.

Never publish secrets in build logs or frontend bundles. No DNS change, hosting purchase, provisioning or deployment is authorized by this blueprint.

## 10. GitHub CI and quality gates

Required pipeline stages:
1. Install from committed lockfile using deterministic install.
2. TypeScript typecheck.
3. ESLint.
4. Unit and integration tests.
5. Production build.
6. Dependency vulnerability scan.
7. Secret scanning.
8. Optional browser E2E and accessibility checks.
9. Upload non-sensitive test/build artifacts.

Do not add a workflow until actual package scripts and workspace layout have been inspected. CI must fail closed on missing required scripts or lockfiles rather than silently skipping checks.

Branch protection and required reviews should be configured only after owner approval.

## 11. UI/UX acceptance criteria

- Small-screen first; no horizontal overflow at 320 CSS px.
- Navigation usable by touch and keyboard.
- Visible focus indicators and semantic landmarks.
- Text/background contrast meets WCAG 2.2 AA.
- Form fields have programmatic labels and useful validation.
- Loading, empty, offline, error, retry and rate-limit states exist.
- Reduced-motion preference is respected.
- Chat history and messages have stable accessible names.
- Streaming status is announced sparingly.
- Destructive actions require confirmation and provide recovery where possible.

## 12. Advanced engineering tools

| Discipline | Tools | Purpose |
|---|---|---|
| Static analysis | TypeScript strict, ESLint | Type and code quality |
| Unit tests | Vitest | Pure logic and service tests |
| API tests | Vitest + Hono test client | Auth, validation and route contracts |
| Browser tests | Playwright | Login and core chat journeys |
| Accessibility | axe-core | Automated accessibility checks |
| Security | npm audit / OSV scanner / secret scanning | Dependency and secret hygiene |
| Observability | structured logs, request IDs, metrics | Diagnose production behavior |
| Database | PostgreSQL EXPLAIN, migrations, backup restore tests | Query and recovery assurance |
| Delivery | GitHub Actions | Reproducible CI gates |

Tool selection must respect budget, platform compatibility and actual repo scripts. No paid tool is mandatory.

## 13. Alternative paths

| Concern | Primary | Alternative | Trade-off |
|---|---|---|---|
| Identity | Auth0 | Supabase Auth / Firebase Auth | Different SDK and policy model |
| UI | Lumen React | Radix UI + custom design tokens | More implementation ownership |
| Hosting | Hostinger Node.js (if supported) | Railway / Cloudflare / Vercel | Runtime, pricing and platform constraints |
| Database | PostgreSQL | Supabase PostgreSQL | Managed features and plan limits |
| Streaming | SSE | WebSocket | SSE simpler for one-way output; WS for bidirectional events |
| Rate limiting | Shared Redis/KV | PostgreSQL-backed counters | DB fallback can add contention |

Do not add a second auth provider or UI kit simultaneously. Select one primary path and document migration boundaries.

## 14. Definition of done

A feature is complete only when:
- implementation exists on the isolated branch;
- typecheck, lint, tests and production build actually pass;
- API authorization and ownership tests pass;
- no secret is committed or exposed;
- mobile and accessibility checks are recorded;
- failure, timeout, cancellation and quota paths are tested;
- dependency and configuration changes are documented;
- deployment and release remain blocked until explicit approval.

Current verified scope: this document describes the target architecture. It is not evidence that integrations are installed, tenant-configured, deployed or tested.
