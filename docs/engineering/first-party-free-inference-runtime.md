# First-party Free-First Inference Runtime

**Status:** IMPLEMENTATION FOUNDATION — mock/local rules only. No external model adapter is enabled.

## Objective

Create an original, provider-neutral runtime owned by InfiniteX. The implementation in this increment is written for this repository and does not vendor or copy an external provider SDK.

## Architecture

```text
API / Agent
   |
   v
InferenceRequest (bounded input, request ID, purpose)
   |
   v
ProviderRuntime
   |-- ProviderPolicy (exact model allowlist, expiry, eligibility, data terms, quota, $0 cost)
   |-- Adapter registry (server-controlled; never selected by client input)
   |
   +--> mock/mock (deterministic tests; no network; no LLM)
   |
   +--> future local model adapter (NOT IMPLEMENTED)
   |
   +--> future hosted free-tier adapter (DISABLED; requires evidence + approval)

LocalRulesEngine is a separate deterministic utility and is not an LLM.
```

## Implemented in this increment

- Provider-neutral request/result contracts with bounded prompt and output-token size.
- A central runtime that checks the existing fail-closed ProviderPolicy before dispatch.
- An explicit adapter registry; client-supplied provider names cannot register adapters.
- A deterministic mock adapter with no network calls.
- A first-party keyword classifier for bounded task routing; clearly marked non-generative.
- Tests that reject OpenAI, Anthropic, OpenRouter, unknown providers, nonzero cost, and paid fallback.
- No new third-party packages, SDKs, API keys, cloud calls, or migrations.

## Free-first decision

The safest default for this repository is **no external inference** until account-specific free-tier terms, quota, data handling, and pricing are verified. A free software license does not make inference or hosting free.

Recommended progression:

1. Keep mock/local rules for CI and deterministic workflows.
2. Evaluate a local open-weight model only on hardware with sufficient RAM/storage and a compatible license. Runtime/weights may be free; compute and power are not automatically free.
3. Evaluate a hosted free quota only after checking exact model, region, account eligibility, data-use terms, hard quota, and current pricing. Add only one explicit adapter after approval.
4. Never configure a paid fallback, automatic top-up, or silent plan upgrade.

## Security contract

- Do not log prompts, tokens, credentials, or private repository contents.
- Provider/model identifiers are selected by server policy, not browser input.
- Every future external adapter must be registered explicitly and authorized by the exact model policy.
- Quota exhaustion, timeout, provider errors, stale free-tier evidence, or billing ambiguity must fail closed.
- A zero-cost result may only be emitted after policy approval; a provider's own price response is not sufficient evidence.
- Add tenant-scoped atomic quota enforcement before connecting any shared provider account.

## Limitations

This is not a conversational LLM, autonomous agent, hosted provider integration, or production-ready quota ledger. The local rules engine performs simple keyword classification only. The mock adapter performs no inference. The external provider allowlist remains empty by default.

## Verification

Run:

```bash
python -m pytest tests/unit/test_provider_policy.py tests/unit/test_provider_runtime.py -q
ruff check iq_core/providers tests/unit/test_provider_runtime.py
```

These commands are instructions; results must be taken from the matching CI run or an actual local execution, not inferred from file creation.
