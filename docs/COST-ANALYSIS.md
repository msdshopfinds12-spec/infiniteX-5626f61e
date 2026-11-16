# Cost controls and assumptions

This branch does not provision Railway services, databases, Redis, or volumes.

Cost drivers:
- API CPU and RAM
- outbound network egress
- database compute and storage if added
- Redis/queue infrastructure if added
- AI provider input/output tokens and model pricing

Current code controls: maximum prompt length, bounded output tokens, request timeout, and process-local rate limit.

Not implemented: durable user quotas, cost ledger, monthly spend enforcement, provider fallback cost ceiling, or distributed rate limiting.

Railway is not an unlimited AI-token provider. AI provider charges and limits are separate from Railway infrastructure charges. Confirm current account pricing and usage in Railway before rollout.