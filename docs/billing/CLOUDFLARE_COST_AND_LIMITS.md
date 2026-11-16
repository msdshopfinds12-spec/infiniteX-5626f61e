# InfiniteX Cloudflare — Cost and Limits Review

**Status:** Planning reference; verify again before provisioning
**Preference:** Free-first; no paid upgrade authorized
**Official documentation checked:** 2026-11-17

## 1. Candidate free-tier allowances

Cloudflare's official documentation currently lists:
- Workers Free: up to 100,000 requests/day and 10 ms CPU time per invocation.
- D1 Free: 5 million rows read/day, 100,000 rows written/day, and 5 GB total included storage.
- D1 Free databases: up to 10 databases, with a 500 MB maximum per database.

These are plan limits, not unlimited capacity or a guarantee of production suitability. Limits and pricing can change. Exceeding daily D1 read/write limits can cause queries to fail until reset. The application must handle this safely and must never grant access when billing state cannot be read.

## 2. Cost guardrails

- Do not enable a paid plan or add a payment method in this phase.
- Do not create Cloudflare resources in this phase.
- Before future provisioning, estimate request volume, row reads/writes, storage, logs, and recovery needs.
- Configure spending limits where supported before paid usage.
- Alert on approaching quotas and provide a safe read-only/degraded state.
- Never promise unlimited requests, storage, or tokens.

## 3. Cost-conscious design

- Keep MVP to one Worker API and one D1 database candidate.
- Avoid KV, Queues, Durable Objects, Workers AI, and R2 until a measured requirement exists.
- Use indexed, owner-scoped queries and bounded pagination.
- Avoid unnecessary polling; cache only non-sensitive public plan metadata where appropriate.
- Keep logs structured and redacted; control log volume.
- No payment-provider network calls in mock phase.

## 4. Official sources

- Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- D1 free plan FAQ: https://developers.cloudflare.com/d1/reference/faq/
- Workers best practices: https://developers.cloudflare.com/workers/best-practices/workers-best-practices/
- Workers secrets: https://developers.cloudflare.com/workers/configuration/secrets/

Recheck these sources before creating any real resource. No plan upgrade or charge is approved.
