# InfiniteX AI Platform — Reference Architecture

Status: architecture proposal, not an implementation claim. The design is model-agnostic, provider-neutral, self-hostable, and least-privilege.

## What modern AI products generally combine

A conversational AI product is more than a language model. Typical layers include:
1. Model layer: transformer-based language models and, where needed, vision, audio, embedding and reranking models.
2. Compute: accelerator hardware (often GPUs), CPUs, memory, storage and networking.
3. Data: curated training/evaluation datasets, document stores, vector indexes, metadata and operational databases.
4. Inference serving: tokenization, batching, model loading, scheduling, streaming, caching and capacity controls.
5. Orchestration: conversation state, prompt construction, retrieval, tool selection, retries and workflow execution.
6. Tools: search, file retrieval, application APIs, sandboxed code execution and connectors.
7. Safety: input/output checks, permission checks, abuse prevention, data boundaries and human approval.
8. Observability: traces, metrics, cost/latency tracking, evaluations and incident review.
9. Product interface: web/mobile UI, authentication, accessibility, account settings and user controls.

Exact model weights, training datasets, infrastructure layouts and proprietary optimizations differ by provider. This project does not assume access to or reproduce them.

## Proposed InfiniteX modular architecture

Start with a modular monolith. Split components into separate services only when measured load, isolation or operational ownership justifies it.

    Mobile / Web Client
           |
           v
    Private API ingress
           |
           +--> Identity and session boundary
           +--> Workspace and project modules
           +--> Agent registry and task planner
           +--> Knowledge and retrieval
           +--> Usage and audit
           +--> AI orchestrator
                    +--> Model router
                    +--> Prompt/context builder
                    +--> Tool policy engine
                    +--> Budget and timeout guard
                    +--> Evaluation hooks
           +--> Provider adapters
                    +--> Remote model API (optional)
                    +--> Local inference endpoint (optional)
           +--> Private PostgreSQL
           +--> Background worker (later)

## Recommended stack and alternatives

| Concern | Initial recommendation | Alternative | Decision rule |
|---|---|---|---|
| API | Existing isolated Node.js API | Python service | Add Python only for a concrete ML workload |
| HTTP | Node.js built-in HTTP | Fastify | Add framework when route/schema needs justify it |
| Database | PostgreSQL + parameterized SQL | Drizzle ORM | Start with explicit SQL; adopt ORM after review |
| Tests | Node built-in test runner | Vitest | Keep current dependency-free test setup |
| Containers | Docker Compose for development | Podman Compose | Choose based on host support |
| Model access | Provider adapter interface | Direct SDK | Keep vendor code behind adapter |
| Local models | Optional inference endpoint | Dedicated inference runtime | Hardware, license and quality evaluation required |
| Retrieval | PostgreSQL full-text search | Vector index | Add embeddings only after retrieval evaluation |
| Jobs | Bounded in-process jobs | Durable queue + worker | Introduce when persistence/retries are needed |
| Telemetry | Structured logs + request IDs | OpenTelemetry stack | Add after privacy/retention review |

## Model router contract

Only route to configured, approved endpoints. Never scrape providers, bypass rate limits, rotate identities to evade quotas, or promise unlimited tokens.

Each adapter reports provider/model ID, modalities, context limits, usage/cost metadata, timeout/retry policy, privacy classification and health. Fallbacks must be explicit. Private data must never silently route to another provider.

## Agent execution safety

Each tool needs a stable ID/version, strict JSON schema, allowlisted implementation, authenticated principal, permission check, timeout/output/resource limits, idempotency key for retryable side effects, audit event and human approval for external, financial, destructive or public actions.

Model output is untrusted input. The model may propose an action; application code decides whether it is permitted.

## AI lifecycle

- Pretraining: large-scale model training; outside this project's scope.
- Fine-tuning: optional later, with lawful, consented and appropriately licensed data.
- RAG: retrieves approved documents at inference time; it does not retrain model weights.
- Inference: sends prompts to a configured model and processes the response.
- Evaluation: measures correctness, safety, latency, cost and regressions.

A self-hosted application does not mean a self-trained frontier model. Competitive general-purpose training requires substantial compute, data, research and operations.

## Cost, security and capacity

- Per-user/workspace quotas; maximum input/output tokens and request size.
- Deadlines, bounded retries, concurrency limits and backpressure.
- Provider spend caps where supported; no promise of unlimited free inference.
- Secrets only on the server; never in browser/mobile bundles.
- Private database network; no direct client database access.
- Tenant ownership checked on every data access.
- Logs redact credentials, session tokens and sensitive payloads.
- Tool execution is allowlisted and sandboxed; no arbitrary shell from model text.
- Public deployment requires separate threat model, TLS/ingress, rate limiting, monitoring and approval.

## Phased delivery

1. Existing API foundation and tests.
2. Identity/session threat model and permission matrix.
3. PostgreSQL ERD, constraints, retention and backup plan.
4. Identity/database implementation after design approval.
5. Model adapter with mock adapter and contract tests.
6. Allowlisted tool registry and approval gates.
7. Retrieval, starting with evaluated full-text search.
8. Bounded agent workflows with traceable state.
9. Production security, load, recovery and privacy audit.

Non-goals: proprietary model replication, private data scraping, quota evasion, unlimited-token claims, public exposure, or autonomous financial/destructive actions.
