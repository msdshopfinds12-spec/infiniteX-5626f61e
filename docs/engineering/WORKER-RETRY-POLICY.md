# InfiniteX Workflow Worker Retry Policy

**Status:** Implemented in the candidate branch; implementation CI verified on commit `60883052e45aac062197b49f26982bc6e57c7f39`  
**Scope:** Authenticated and cron workflow workers  
**Persistence:** Existing `workflow_step_runs.attempt` remains the workflow-claim generation fence; no schema change was made

## CI evidence

The implementation passed the candidate push and pull-request quality gates on commit `60883052e45aac062197b49f26982bc6e57c7f39`:
- [Push quality gates — SUCCESS](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44792666068)
- [Pull request quality gates — SUCCESS](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44792675408)

Verified steps: exact lockfile installation, dependency audit, TypeScript lint, unit/regression tests, Edge Function/worker security tests, and production build.

## Contract

- `retry_limit` means the number of additional attempts after the initial action attempt.
- The runtime accepts integer values from 0 through 10. Missing/null values default to 0. Invalid values fail closed.
- Retries are allowed only for explicitly tagged errors with one of these codes:
  - `NETWORK_ERROR`
  - `UPSTREAM_TIMEOUT`
  - `UPSTREAM_UNAVAILABLE`
  - `RATE_LIMITED`
- Ordinary JavaScript errors, validation failures, unsupported actions, authorization failures, malformed payloads, and size/time-budget failures are not retried.
- Backoff uses capped exponential full jitter: base 100 ms, maximum 1,000 ms.
- Each step has one aggregate retry execution budget equal to its configured step timeout. Attempts and backoff share this budget; retries cannot multiply the total step timeout.
- Both authenticated and cron workers call the same runtime-neutral retry helper.

## Current allowlist behavior

The currently supported workflow actions are local deterministic transformations:
`pass_through`, `set_value`, `merge_json`, `uppercase_text`, `lowercase_text`, `append_text`, and `prepend_text`.

These actions do not currently call remote services and do not emit the allowlisted transient error codes. Therefore the retry helper is intentionally dormant for the current action set; a configured retry limit does not repeat deterministic failures. This is deliberate and safer than retrying every exception.

When an external integration action is introduced, its adapter must:
1. map only known transient upstream failures to an allowlisted error code;
2. keep validation/authentication/configuration errors non-retryable;
3. enforce idempotency for operations with side effects;
4. use bounded request timeouts and cancellation;
5. add adapter-level tests and worker integration tests before enabling retries.

## Verification cases added

- Retry-limit range and semantics.
- Retry on allowlisted transient failures only.
- No retry for deterministic errors.
- Exactly initial attempt plus configured retries.
- Capped exponential delay.
- Aggregate elapsed budget across attempts and backoff.
- Both worker entry points import and invoke the shared helper.

## Remaining limitations

- The timeout is cooperative around synchronous action execution and cannot preempt a blocked JavaScript isolate.
- The helper does not persist per-retry attempt telemetry. The database attempt field remains reserved for workflow lease-generation fencing.
- No production Edge Function was deployed. Runtime drift remains a release blocker until candidate code is reviewed and deployed through an approved release process.
