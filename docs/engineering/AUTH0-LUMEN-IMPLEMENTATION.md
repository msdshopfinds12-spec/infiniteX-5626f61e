# Auth0 + Lumen UI Implementation Blueprint

Date: 2026-11-16
Branch: feature/infiniteX-platform-integrations
Status: source-reviewed blueprint; SDK installation and browser integration are pending.

## 1. Verified foundation

- Frontend: React 18, TypeScript and Vite.
- Root package uses npm lockfile v3.
- Neither @auth0/auth0-react nor @santi020k/lumen-react is installed.
- API: Hono, jose, Zod, PostgreSQL client and per-user rate limiting.
- AI generation already requires a bearer token and derives usage ownership from the verified principal.
- Auth middleware checks issuer, audience, standard JWT time claims and subject.
- Current UI is an engineering dashboard preview, not a functioning conversational AI client.

## 2. Target architecture

    React SPA (Vite)
      Auth0Provider: Universal Login + Authorization Code + PKCE
      Protected application shell
      Lumen presentation:
        MessageScroller
        Message + Avatar + Bubble
        StreamMessage
        PromptComposer
      Auth-aware API client:
        getAccessTokenSilently -> API access token
      Conversation state, streaming state, cancellation and errors
                    |
                    | HTTPS + Authorization: Bearer API access token
                    v
    Hono API
      Request ID, secure headers, body limit and strict CORS
      jose JWT verification: RS256, issuer, audience, exp and nbf
      Rate limit -> authorization -> Zod validation
      AI provider adapter, timeout and output-token ceiling
      PostgreSQL repositories and usage ledger

Authentication establishes identity. Authorization and tenant/resource ownership must still be enforced by every API operation.

## 3. Dependency gate

Do not import SDK components until dependencies and the npm lockfile are updated together.

After a reviewed dependency change, from repository root:

    npm install @auth0/auth0-react
    npm install @santi020k/lumen-react@5.0.0
    npm run lint
    npm run build

Review package.json and package-lock.json as one change. Lumen 5.0.0 matches the connected catalog snapshot. Let npm resolve the current Auth0 SDK version and verify peer dependencies; do not guess a version.

These install and build commands have NOT been executed in this session.

## 4. Auth0 configuration

Configure two separate Auth0 resources:

A. Single Page Application
- Universal Login.
- Authorization Code + PKCE.
- Exact Allowed Callback URLs, Logout URLs, Web Origins and CORS origins.
- No client secret for the SPA.

B. API
- Stable API identifier/audience.
- RS256 signing algorithm.
- Add scopes only when corresponding permissions are enforced by API routes.

Public Vite configuration placeholders:

    VITE_AUTH0_DOMAIN=YOUR_TENANT_DOMAIN
    VITE_AUTH0_CLIENT_ID=YOUR_SPA_CLIENT_ID
    VITE_AUTH0_AUDIENCE=YOUR_API_IDENTIFIER
    VITE_API_BASE_URL=http://localhost:3000

VITE variables are public and bundled into browser code. Never put client secrets, provider API keys, database URLs or private credentials in VITE variables.

Do not create or modify a real .env file, read existing .env contents, or change Auth0 tenant settings without explicit user approval.

## 5. React provider implementation (after dependency install and approved configuration)

    import { StrictMode } from "react";
    import { createRoot } from "react-dom/client";
    import { Auth0Provider } from "@auth0/auth0-react";
    import App from "./App";
    import "./styles/global.css";

    const { VITE_AUTH0_DOMAIN, VITE_AUTH0_CLIENT_ID, VITE_AUTH0_AUDIENCE } = import.meta.env;

    if (![VITE_AUTH0_DOMAIN, VITE_AUTH0_CLIENT_ID, VITE_AUTH0_AUDIENCE].every(
      (value) => typeof value === "string" && value.trim().length > 0
    )) {
      throw new Error("Auth0 public configuration is missing.");
    }

    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <Auth0Provider
          domain={VITE_AUTH0_DOMAIN}
          clientId={VITE_AUTH0_CLIENT_ID}
          cacheLocation="memory"
          authorizationParams={{
            redirect_uri: window.location.origin,
            audience: VITE_AUTH0_AUDIENCE,
            scope: "openid profile email",
          }}
        >
          <App />
        </Auth0Provider>
      </StrictMode>
    );

Use the SDK default memory cache. Do not manually persist access tokens in localStorage. Add typed ImportMetaEnv declarations for the four documented public variables when implementing.

## 6. Auth-aware API client pattern

    import type { GetAccessTokenSilentlyOptions } from "@auth0/auth0-react";

    type TokenProvider = (
      options?: GetAccessTokenSilentlyOptions
    ) => Promise<string>;

    export function createApiClient(getAccessToken: TokenProvider) {
      const baseUrl = import.meta.env.VITE_API_BASE_URL.replace(/\/$/, "");
      const audience = import.meta.env.VITE_AUTH0_AUDIENCE;

      async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
        if (!path.startsWith("/") || path.startsWith("//")) {
          throw new Error("API path must be an absolute path.");
        }

        const token = await getAccessToken({
          authorizationParams: { audience },
        });

        const response = await fetch(baseUrl + path, {
          ...init,
          headers: {
            Accept: "application/json",
            ...(init.body ? { "Content-Type": "application/json" } : {}),
            ...init.headers,
            Authorization: "Bearer " + token,
          },
        });

        if (!response.ok) {
          throw new Error("API request failed with status " + response.status);
        }

        return (await response.json()) as T;
      }

      return { request };
    }

Call getAccessTokenSilently before API requests; do not cache the token manually. Handle 401, 403, 429, 5xx and network errors distinctly. Retry only safe/idempotent operations. Never log authorization headers or tokens.

## 7. Lumen chat component composition (after dependency install)

The following React contracts were inspected in the Lumen catalog v5.0.0: MessageScroller, Message, Avatar, Bubble, StreamMessage and PromptComposer. The React components own their interactive behavior; do not mount the Astro runtime in this React app.

    import {
      Avatar, Bubble, Message, MessageScroller,
      PromptComposer, StreamMessage,
    } from "@santi020k/lumen-react";
    import "@santi020k/lumen-react/styles.css";

    type ChatItem = {
      id: string;
      role: "user" | "assistant";
      text: string;
      status?: "idle" | "streaming" | "complete" | "error" | "canceled";
    };

    export function ChatSurface({
      messages, pending, onSend, onStop,
    }: {
      messages: ChatItem[];
      pending: boolean;
      onSend: (text: string) => void;
      onStop: () => void;
    }) {
      return (
        <section aria-label="AI conversation" className="chat-surface">
          <MessageScroller autoScroll scrollThreshold={40}>
            {messages.map((item) => (
              <Message key={item.id} from={item.role}>
                <Avatar fallback={item.role === "assistant" ? "AI" : "You"} />
                {item.role === "assistant" ? (
                  <StreamMessage
                    label="Assistant"
                    status={item.status ?? "complete"}
                    statusLabel={
                      item.status === "streaming" ? "Assistant is responding" :
                      item.status === "error" ? "Response failed" :
                      "Response complete"
                    }
                  >
                    <p>{item.text}</p>
                  </StreamMessage>
                ) : (
                  <Bubble from="user">{item.text}</Bubble>
                )}
              </Message>
            ))}
          </MessageScroller>
          <PromptComposer
            label="Write a message"
            maxLength={20000}
            pending={pending}
            submitOnEnter={false}
            onPromptSubmit={({ text }) => onSend(text)}
            onStop={onStop}
          />
        </section>
      );
    }

This is a verified presentation contract, not a completed chat feature. The application still owns transport, stream parsing, state, cancellation, retries and error recovery. Render model output as text or safely parsed Markdown; never trust provider HTML.

## 8. Backend JWT verification

The existing Hono middleware uses jose with remote JWKS. It now explicitly allowlists RS256:

    const verified = await jwtVerify(header.slice(7), jwks, {
      issuer,
      audience,
      algorithms: ["RS256"],
    });

Continue requiring a non-empty sub. Use only the verified principal, never a client-supplied user ID. jose validates standard exp and nbf claims. The configured issuer must exactly match the token issuer, including the trailing slash.

Before production:
- Confirm JWKS URL belongs to the configured trusted issuer.
- Add route-level scope/permission checks where needed.
- Enforce tenant and record ownership in every repository operation.
- Test missing, malformed, expired, wrong-issuer, wrong-audience, wrong-algorithm, missing-subject and valid tokens.
- Keep CORS origins exact; require HTTPS in production.

## 9. UI/UX acceptance criteria

- Mobile-first layouts at 320, 360, 390, 768 and 1280 CSS px.
- Conversation history, new conversation, message feed, composer, stop, retry, copy and empty state.
- Explicit loading, streaming, complete, canceled, offline, unauthorized, rate-limited and provider-error states.
- Keyboard-only operation, visible unobscured focus and meaningful accessible labels.
- Announce stream status changes, not every generated token.
- Respect reduced-motion settings.
- WCAG 2.2 AA target: 4.5:1 normal text contrast and 3:1 large text/meaningful UI boundaries.
- No horizontal overflow on phone screens.
- Never fabricate model names, token counts, usage costs or online status.

## 10. Verification plan

After dependency and source changes are made:

    npm ci
    npm run lint
    npm run build

Use the existing API Vitest script for auth and authorization tests. Add a committed API lockfile before running npm ci inside apps/api.

Browser acceptance:
1. Logged-out users cannot access protected data.
2. Universal Login returns to the correct app location.
3. API calls use API access tokens, never ID tokens.
4. Invalid/expired/wrong-audience tokens receive 401.
5. Users cannot access another user's records.
6. Submit, stream, stop, retry and error states work.
7. Mobile keyboard, screen-reader and reduced-motion checks pass.

## 11. Alternatives

| Concern | Primary option | Alternative | Trade-off |
|---|---|---|---|
| Authentication | Auth0 SPA + PKCE | Supabase Auth | Supabase may simplify if its PostgreSQL backend is the selected platform |
| UI | Lumen React | Radix + app-owned design system | More custom work, fewer Lumen-specific dependencies |
| Streaming | Server-Sent Events | WebSocket | SSE is simpler for one-way model output; WebSocket for bidirectional sessions |
| Token/session | SDK memory cache | BFF + HttpOnly secure cookies | BFF adds server/session complexity but reduces browser token exposure |
| Hosting | Decide after read-only audit | Railway / Cloudflare / Vercel | Compare runtime, limits, logs, backups and real costs |

## 12. Release gates

- No .env writes or Auth0 tenant changes without explicit approval.
- No package integration without a reviewed manifest and lockfile diff.
- No merge, deployment, billing or DNS changes without explicit approval.
- Do not mark complete until build, tests, browser QA, security and accessibility evidence exists.
