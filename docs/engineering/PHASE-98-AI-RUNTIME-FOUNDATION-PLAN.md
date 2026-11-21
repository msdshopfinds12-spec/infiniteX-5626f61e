# Phase 98 — AI Runtime Foundation Plan

**Base:** `b43e85fecb39a9a91db15fefbec1d67dfd0e2c98` (Phase 97 exact-head quality + disposable security CI pass)
**Branch:** `phase-98-ai-runtime-foundation`
**Budget:** free-first; no paid provider or external service activation.
**Production changes:** prohibited in this phase.

## 1. Verified current state

- The React app has no verified live AI provider or model execution service.
- `src/components/AgentList.tsx`, `PipelineBoard.tsx` and `LogStream.tsx` render explicitly labeled sample/demo records.
- The main UI explicitly reports AI agent runtime as not connected and execution telemetry as not measured.
- Workflow workers execute a bounded allowlist of local workflow actions; this is not an LLM runtime.
- No provider key, billing permission, live model endpoint or user-level AI quota has been verified.

## 2. Phase 98 objective

Create a provider-independent, server-side AI request boundary that is secure by default and can be tested without provider credentials.

The production adapter will remain **disabled / not configured** until a separately approved provider integration exists. Tests may inject a deterministic fake provider; fake output must never be represented as real model output in the application.

## 3. Proposed architecture

```text
React client
  │ POST { task, input.text } + authenticated Supabase JWT
  ▼
simula-ai-runtime Edge Function
  ├─ exact-origin CORS
  ├─ Supabase Auth getUser() validation
  ├─ bounded streamed JSON parsing
  ├─ task/input allowlist and UTF-8 byte limits
  ├─ server-side provider resolver (no client provider/model override)
  ├─ request deadline + bounded output validation
  └─ safe response / sanitized error
       │
       ├─ provider absent → 503 ai_provider_not_configured
       └─ injected test adapter → deterministic test-only result
```

## 4. Request contract

Allowed request fields only:
- `task`: one of `summarize`, `draft`, `classify`
- `input.text`: non-empty UTF-8 text, maximum 16 KiB

Rejected fields:
- caller-selected provider/model
- caller-supplied system prompt
- API keys, bearer tokens in JSON, tool execution instructions, arbitrary URLs
- unknown request fields

Response limits:
- bounded output text, maximum 8 KiB
- generic provider failure code; no upstream body, secret or stack trace
- `Cache-Control: no-store`

## 5. Security and cost controls

- Authenticate every request with Supabase `auth.getUser(bearer)`.
- Reuse exact-origin CORS policy and bounded streamed JSON parser.
- No service-role key is needed by the initial disabled runtime.
- Provider credentials, when approved later, must be Edge Function secrets only.
- No client-supplied provider/model selection.
- Per-request input/output byte limits and a hard request deadline.
- No prompt or generated-content logging.
- No automatic retries for generation calls.
- No provider network request when the provider is absent.
- No billing, paid service activation or secret changes.

**Explicit limitation:** This phase does not implement a persistent per-user monthly quota or atomic credit debit. That requires a separately reviewed database design and migration. Until then, provider execution stays disabled in production.

## 6. Implementation manifest

| Area | Planned files | Verification |
|---|---|---|
| Runtime core | `supabase/functions/_shared/ai-runtime.ts` | Deno contract tests |
| Edge Function | `supabase/functions/simula-ai-runtime/index.ts` | auth/CORS/body/provider boundary tests |
| Tests | `supabase/functions/_shared/ai-runtime.deno.ts` | deterministic injected provider |
| CI | `.github/workflows/infinitex-quality-gates.yml` | Deno check + tests |
| Documentation | this plan + final report | capability and limitation audit |

No database migration, generated type change, frontend activation, provider SDK, external fetch or secret is included.

## 7. Acceptance criteria

1. Missing/invalid JWT is rejected before provider resolution.
2. Disallowed origin, method, JSON shape, task and unknown keys fail closed.
3. Actual streamed body bytes are bounded.
4. Provider is never invoked for invalid or unauthenticated requests.
5. Missing production provider returns 503 and makes zero external calls.
6. Injected deterministic provider is testable and output size/deadline are enforced.
7. Provider exceptions are sanitized; no prompt, secret or stack trace leaks.
8. Existing npm/Deno/worker tests and production build remain green.

## 8. Alternative designs considered

1. **Provider-independent Edge Function + disabled default:** selected; smallest safe server-side foundation, no paid dependencies and no secret exposure.
2. Browser-side direct provider calls: rejected because keys and usage controls would be exposed.
3. Add provider SDK and live model immediately: rejected because no approved provider, key, budget or account quota is verified.
4. Reuse workflow worker as an LLM endpoint: rejected; workflow execution and model inference have different trust, timeout and cost boundaries.
5. Add quota/credit schema now: deferred until policy, free-tier constraints and atomic debit behavior are reviewed.

## 9. Approval and release gates

Phase 98 code is repository-only. No provider is activated, no secret is created, no database migration is applied, no deployment or merge occurs. Any live provider adapter requires a new explicit approval after cost, retention, privacy, rate-limit and quota review.

**Plan status:** APPROVED FOR REPOSITORY-ONLY IMPLEMENTATION.
**Provider execution:** DISABLED.
**Production release:** NOT APPROVED.
