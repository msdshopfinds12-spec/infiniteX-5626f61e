# Phase 4N.4 — Retry Reliability Engineering

**Status:** implementation candidate; automated verification pending.  
**Base:** `fix/phase-4n3-step-budget-enforcement` at `e9115d97128e4a944c70987f4bad266e8c281083`.  
**Scope:** shared retry primitives, removal of unsafe immediate retries from deterministic local worker actions, regression coverage, and CI.

## Decisions

1. Retry only known transient failures: HTTP 408, 425, 429, 500, 502, 503, 504 and a narrow allowlist of transport error codes.
2. Treat validation, authorization, unsupported-action, abort, and all unclassified failures as permanent.
3. Use capped exponential backoff with full jitter. Honor Retry-After only within the configured delay cap.
4. Keep attempt count, delay, and total elapsed time bounded. Waits are asynchronous and abort-aware; they do not block the JavaScript event loop.
5. Side-effecting operations require a stable idempotency key. The same key is passed on every attempt.
6. A generated key is not, by itself, an idempotency guarantee. A future adapter must pass it to a provider that enforces idempotency, or use a durable atomic idempotency store with a unique constraint. No such persistence schema is introduced in this phase.
7. Existing worker actions are deterministic, local transformations. They have no transient I/O boundary, so retrying them immediately is incorrect and wasteful. Both workers now execute these local actions once. The persisted `retry_limit` is not used for these action types until an action adapter explicitly declares retry safety and provides idempotency enforcement.

## Runtime architecture

```text
Worker entrypoint
  -> validate owner / run / step / timeout / payload
  -> execute deterministic local action once
  -> (future external adapter only)
       classify error
       validate retry policy and idempotency key
       compute capped exponential full-jitter delay
       await abort-aware scheduler
       retry with the SAME provider-enforced idempotency key
  -> persist final status and metadata
```

## Module contract

- `retry-reliability.mjs`: runtime-neutral policy, classification, delay, Retry-After parsing, key generation, abort-aware wait, bounded executor.
- `retry-reliability.test.mjs`: Node regression suite.
- `retry-reliability.deno.ts`: Deno-native regression suite.
- `runWithRetry(operation, options)`: opt-in only; defaults to 3 attempts, 250 ms base delay, 5 s delay cap, and 15 s total elapsed budget.
- `sideEffecting: true`: requires a valid stable key before invoking the operation. Adapter contract must ensure provider-side deduplication.

## Important serverless constraint

An asynchronous timer does not block the event loop, but it does keep the current Edge Function invocation alive. For long delays or durable recovery, use a persisted scheduled-job/queue record and let a later invocation claim it. That requires verified schema/RPC contracts and a separate migration approval; this phase does not invent those contracts or add migrations.

## Security and data-integrity boundaries

- No automatic retry for 4xx validation/auth failures except the explicitly listed 408/425/429.
- Abort is terminal.
- Invalid policy, random source, clock, or idempotency key fails closed.
- Idempotency identity uses run ID, step ID, and action version; raw payloads, user identifiers, and secrets are not included in the key material.
- Do not log raw keys, credentials, request bodies, or provider responses.
- A timeout after an external provider accepted a request is an ambiguous outcome. Retrying is safe only if the provider enforces the same idempotency key.

## Verification gate

CI must pass on the exact PR head SHA: Node retry tests, existing worker security and CORS tests, Deno retry tests, Deno worker type checks, and the application build. No schema migration, secrets, billing, merge, or deployment is included. CI results are not claimed until GitHub Actions reports a completed run for the exact commit.
