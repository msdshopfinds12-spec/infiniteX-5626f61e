# InfiniteX Production-Only Browser Origin Policy

**Status:** Approved policy; source-level regression coverage added on an isolated GitHub branch  
**Canonical production origin:** `https://infinitexultra.vercel.app`  
**Preview policy:** Deny all Vercel Preview origins by default  
**Unknown-origin policy:** Deny  
**Scope:** Browser CORS response policy for the authenticated workflow worker and API-key manager

## Required runtime configuration

For each browser-facing Supabase Edge Function that uses the shared CORS helper, the intended allowlist value is exactly:

```text
INFINITEX_ALLOWED_ORIGINS=https://infinitexultra.vercel.app
```

Do not add wildcard values, Vercel Preview URLs, localhost origins, alternate ports, or sibling domains. The allowlist is a server-side Edge Function setting; it is not a `VITE_*` browser variable and must never be placed in the frontend bundle.

This repository change documents the intended value only. It does not modify Supabase production settings, secrets, or deployed functions. Applying or changing the live setting requires a separate explicit production-configuration approval and a post-change verification.

## Request handling invariants

1. Compare the complete serialized `Origin` value against the exact configured allowlist. Do not use suffix, substring, wildcard, or loose hostname matching.
2. Return no `Access-Control-Allow-Origin` header for denied origins.
3. Reject denied browser origins before processing application requests, including preflight requests.
4. CORS is not authentication. Every protected endpoint must independently validate the bearer session or its server-to-server credential.
5. A request without an `Origin` header is not a browser-origin request. It may proceed only through the endpoint's independent authentication/authorization checks; absence of CORS headers does not grant access.
6. Keep cron/worker endpoints server-to-server. Do not add browser CORS to them as a substitute for their worker-secret verification.
7. Never expose service-role credentials, worker secrets, signing keys, or API-key digests to the browser.

## Preview workflow

Preview deployments remain blocked from production Edge Function browser access. If preview testing is needed later, use an isolated non-production Supabase project and a separately reviewed allowlist. Do not add preview origins to the production allowlist.

## Verification

The shared CORS regression suite must prove:

- The exact production origin is accepted and receives an exact ACAO header.
- Vercel Preview, unknown, lookalike, HTTP, alternate-port, and localhost origins are denied.
- Empty configuration fails closed for browser origins.
- A non-browser request without an Origin header receives no ACAO header and still requires endpoint authentication.
- Worker bearer/session authentication and database RLS remain independent controls.

A passing unit test proves helper behavior only. It does not prove that the live Edge Function setting is configured, that deployed source matches the repository, or that authentication/RLS work against production.

## Rollout gates

Before any production rollout:

- Reconcile candidate source with the currently deployed Edge Function source.
- Verify which deployed functions use the shared CORS helper.
- Inspect the actual `INFINITEX_ALLOWED_ORIGINS` runtime setting without exposing unrelated secrets.
- Apply the exact value only after separate approval.
- Verify allowed and denied origins against an isolated test endpoint or approved production-safe read-only check.
- Confirm bearer authentication and RLS independently.
- Record exact source commit and deployed function version.

No production configuration, secret, migration, deployment, merge, or release is authorized by this document.
