# Free-tier AI provider, MCP, and repository audit

**Audit date:** 2026-11-17  
**Scope:** 41 repositories visible to the connected GitHub account. Repository trees were inventoried; AI model entrypoints, manifests, and selected environment examples were inspected in the likely AI-related projects. This is not a full line-by-line source, runtime, deployment, or secret-history audit.

## Executive decision

The collection is **not currently $0-only**. Several AI templates explicitly select OpenAI or Anthropic models. The Activepieces fork documents an OpenRouter credit-metered provider. Those are not safe defaults for a strict no-billing project.

For InfiniteX, keep model inference disabled until a provider-neutral adapter, exact free-model allowlist, hard $0 budget gate, and tests are in place. Use a mock provider for tests and no paid fallback. Cloudflare Workers AI is the leading hosted free-quota candidate to evaluate, not a verified entitlement on this account.

## Repository inventory

GitHub listed 41 accessible repositories. One repository, kody-eve-template, is empty. Two large repositories, activepieces and examples, are upstream/template collections rather than evidence of deployed InfiniteX services.

The 41 repositories inventoried:

1. -msd-digital-finds
2. Open-ai
3. Detectiverx
4. ai-master-controller
5. eve-content-agent-template
6. eve-chat-template
7. bagsikai-agent
8. .github
9. explore
10. infiniteX-5626f61e
11. skills-getting-started-with-github-copilot
12. skills-customize-your-github-copilot-experience
13. skills-integrate-mcp-with-copilot
14. skills-build-applications-w-copilot-agent-mode
15. skills-agentic-workflows-that-read-the-room
16. skills-agent-orchestration-build-your-ai-dream-team
17. skills-hello-github-actions
18. skills-introduction-to-codeql
19. skills-migrate-ado-repository
20. skills-github-pages
21. introduction-to-github
22. activepieces
23. nexusai-support
24. nextjs-with-supabase
25. subscription-starter
26. Copilot1
27. eve-company-brain-template
28. hexora-ai
29. marketing-team-eve-template
30. msdshopfinds12-spec-infiniteGX.7-IQ-Core
31. create-react-app
32. examples
33. auth0-react
34. jev-and-ai-sdk
35. nextjs-boilerplate
36. personal-agent
37. amazon-s3-vectors-store
38. eve-software-factory-template
39. kody-eve-template
40. eve-data-agent-template
41. INNERVERSE

A tree inventory is not proof that every file, runtime path, secret, or deployment was reviewed. Uninspected paths remain NOT VERIFIED.

## Paid or non-$0 inference configurations detected

| Repository | Observed model/provider configuration | Assessment |
|---|---|---|
| eve-content-agent-template | Anthropic Claude Opus 4.8 | NOT FREE — paid API model |
| eve-chat-template | Anthropic Claude Sonnet 5 | NOT FREE — paid API model |
| eve-data-agent-template | Anthropic Claude Sonnet 5 | NOT FREE — paid API model |
| eve-company-brain-template | Anthropic Claude Sonnet 5 | NOT FREE — paid API model |
| personal-agent | Anthropic Claude Sonnet 5 | NOT FREE — paid API model |
| bagsikai-agent | OpenAI GPT-5.6 Luna Fast | NOT FREE — paid API model |
| eve-software-factory-template | OpenAI GPT-5.6 Terra Fast and Anthropic Claude Fable 5 | NOT FREE — mixed paid-provider configuration |
| jev-and-ai-sdk | TypeSafe Jev and OpenAI GPT-6 Luna Fast fallback; live calls require Vercel AI Gateway access | NOT VERIFIED $0 — do not enable under strict $0 policy |
| activepieces | Supports OpenAI, Anthropic and other providers; managed OpenRouter path is metered through Autumn credits and documents a $500/month managed-key guardrail | NOT FREE by default — keep managed credits/billing disabled |

Model identifiers were read from source files. Live model availability and successful inference were not tested. Provider pricing classification is about API inference, not consumer chat subscriptions.

### Primary InfiniteX finding

The default-branch InfiniteX package manifest contains a Vite/React frontend and does not declare an OpenAI, Anthropic, Gemini, OpenRouter, or AI SDK inference dependency. This means no paid inference dependency was detected in that manifest; it does not prove every backend/runtime path is free. Treat model inference as disabled until verified.

### Other findings

- nextjs-with-supabase: the inspected environment example contains Supabase URL and publishable-key placeholders; no AI provider key was found in that file.
- subscription-starter: includes Supabase and Stripe examples. This is not evidence of AI inference spend, but activating payment services is outside a strict $0-only setup.
- personal-agent: calls a remote Linear MCP endpoint using a bearer token; Linear account access and plan limits are separate from model inference.
- activepieces .env.example: AP_OPENAI_API_KEY is empty in the example.
- activepieces .env.dev: tracked development configuration contains non-empty local/dev authentication and queue values. Values are intentionally not reproduced here. This audit cannot determine whether they are disposable development defaults or credentials reused elsewhere. Confirm privately. If any value is a real shared/deployed credential, rotate it and remove it from tracked history through an approved secret-remediation process.

## Free-first provider candidates

No provider is unlimited. A $0 tier means eligible calls within the published free allocation may cost $0. Quotas, region, account eligibility, privacy, commercial-use terms, model availability, and production restrictions must be checked before activation.

| Candidate | Verified constraint | Recommendation |
|---|---|---|
| Cloudflare Workers AI | Official pricing states 10,000 Neurons/day on Workers Free. Usage above the allocation requires Workers Paid. Some catalog models require paid billing. | BEST HOSTED CANDIDATE TO EVALUATE FIRST. Pin only a model confirmed free in the account. Enforce quota and fail closed. |
| Groq | Official docs publish per-model RPM, RPD, TPM and TPD limits; exact limits vary by model and organization. | Secondary candidate after account-level quota and terms review. |
| OpenRouter free variants | Official docs state :free variants have $0 model pricing and are limited to 20 RPM / 50 RPD before the higher purchased-credit threshold. Upstream provider data terms vary. | Optional prototype only. Never buy credits to raise limits; do not send private code or secrets without reviewing the exact upstream data policy. |
| Google Gemini API Free | Official pricing shows selected models with free input/output tokens. Free-tier content may be used to improve Google products. | Not default for private repository content. Eligibility and data-use review required. |
| Local open-weight models | Model weights/runtime may be available without per-token API charges; hardware, storage, power, and model-license terms still apply. | Offline option on suitable hardware; not assumed feasible on an Android-only workflow. |

Never label an entire provider free. Allowlist exact model IDs and exact free tiers. No paid model fallback is allowed.

## MCP server search and selection

MCP servers are integration software; they do not provide free model inference. A free/open-source MCP server may still connect to a paid API or account.

Recommended candidates from the official Model Context Protocol reference ecosystem:

| Capability | Candidate | Safe selection notes |
|---|---|---|
| Filesystem | Official Filesystem MCP | MIT-licensed. Use explicit allowed directories and read-only mode for audits. Do not expose the whole device or secrets directory. |
| Git | Official Git MCP | Useful for local repository inspection. Expose read-only operations first; branch, commit, and write actions require separate approval. |
| Public web retrieval | Official Fetch MCP | Useful for public documentation. Restrict outbound destinations and defend against SSRF. |
| Local memory | Official Memory MCP | Optional prototype; not tenant-safe production memory without isolation and persistence review. |
| Sequential workflow | Official Sequential Thinking MCP | No model provider included; workflow aid only, not a substitute for tests or evidence. |

Exclusions and caveats:
- The official MCP servers repository labels its implementations as reference implementations, not production-ready products.
- The official repository lists former GitHub and PostgreSQL servers as archived. Do not select those archived implementations as new production dependencies.
- A GitHub integration is already connected in this workspace; do not add a duplicate GitHub MCP server without a specific missing capability.
- Prefer existing GitHub and Supabase connectors when they already satisfy the workflow.
- The official repository uses Apache-2.0 for new contributions and retains MIT licensing for existing code. The Filesystem server documents MIT licensing. Pin a reviewed release and inspect each package's own license before vendoring or redistributing.

## Required $0-only architecture

### Provider interface

Use a provider-neutral adapter. Adapters must not decide billing policy.

- Provider IDs: mock, cloudflare-workers-ai, groq, openrouter-free.
- Model metadata: exact model ID, provider, last free-tier verification date, token limits, tool/vision capabilities.
- Request metadata: request ID, tenant ID, purpose, model, bounded input, max output tokens, timeout.
- Result metadata: request ID, provider, model ID, output, usage and policy-approved cost of zero.

A result may claim costUsd = 0 only if the policy gate approved the exact model and free tier. Do not trust a provider-reported zero as the sole proof.

### Mandatory policy gates

1. Default provider is mock; tests make no network model calls.
2. Production inference remains disabled until an operator explicitly enables a reviewed free model.
3. Exact provider and model IDs must be allowlisted; unknown IDs are denied.
4. Paid-only models, paid-only features, paid fallbacks, and credit top-ups are denied.
5. Hard spend limit is exactly 0.00 USD. No auto-upgrade, auto-top-up, or silent fallback.
6. Provider quota is checked before each call; concurrency and tenant quotas are atomic.
7. Timeout, 429, quota exhaustion, or billing ambiguity returns a controlled error. Never retry through a paid provider.
8. Secrets stay server-side and are never logged, returned to the browser, or committed.
9. Record provider, model, policy decision, request ID, usage and pricing snapshot; do not store prompts by default.
10. Revalidate free-tier terms and exact model eligibility before release.

### Required tests

- Reject OpenAI and Anthropic model IDs in $0-only mode.
- Reject unknown providers and model IDs.
- Reject model IDs that lose their free suffix or move to a paid tier.
- Reject paid-only features even if an adapter can technically call them.
- Verify no paid fallback on 429, timeout, model-not-found, or quota exhaustion.
- Verify mock mode makes zero network calls.
- Verify tenant quota races are atomic.
- Verify secrets never appear in logs or client responses.
- Verify free quota exhaustion fails closed without payment or plan upgrade.
- Verify a pricing/catalog change disables the model pending review.

## Implementation order

1. Finish the InfiniteX foundation audit and preserve branch isolation.
2. Add the provider interface and policy gate with mock adapter only.
3. Add Cloudflare Workers AI as an opt-in adapter only after exact model eligibility and quota behavior are verified.
4. Add integration tests with external network calls disabled by default.
5. Add a free-tier model registry and pricing-drift review.
6. Add MCP servers only where a concrete workflow needs them; filesystem/Git read-only first.
7. Keep paid templates as reference examples; never copy their paid model IDs into InfiniteX.
8. Require separate approval before changing any other repository, enabling an external provider, or changing billing/deployment settings.

## Sources

- Official MCP reference servers: https://github.com/modelcontextprotocol/servers
- MCP reference-server warning and archived-server list: https://github.com/modelcontextprotocol/servers/blob/main/README.md
- Filesystem MCP read-only mode and MIT license: https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem
- MCP release/security fixes: https://github.com/modelcontextprotocol/servers/releases
- Cloudflare Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Groq rate limits: https://console.groq.com/docs/rate-limits
- OpenRouter free models and limits: https://openrouter.ai/collections/free-models
- Gemini API pricing and free-tier data use: https://ai.google.dev/gemini-api/docs/pricing
- OpenAI API pricing: https://platform.openai.com/pricing/
- Anthropic API usage credits: https://support.anthropic.com/en/articles/8977456-how-do-i-pay-for-api-usage
- Anthropic Claude Sonnet 5 pricing: https://www.anthropic.com/news/claude-sonnet-5
- Anthropic Claude Fable pricing: https://www.anthropic.com/claude/fable
