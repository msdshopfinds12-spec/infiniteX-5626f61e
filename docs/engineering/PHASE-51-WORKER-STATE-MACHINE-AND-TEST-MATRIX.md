# Phase 51 — Worker State Machine and Test Matrix

**Status:** Test specification; tests not yet implemented or executed.

## 1. Deterministic retry contract

| retry_limit | Maximum total attempts | Expected behavior |
|---:|---:|---|
| 0 | 1 | First failure is terminal |
| 1 | 2 | One retry after retryable failure |
| 2 | 3 | Two retries after retryable failures |
| 10 | 11 | Ten retries after retryable failures |

A permanent failure is terminal regardless of remaining retry budget. A retry must be persisted with a due timestamp and reclaimed atomically.

## 2. Required unit tests

- retry_limit 0 does not schedule a retry.
- retry_limit 1 schedules exactly one retry for a transient failure.
- retry_limit maximum does not exceed the total-attempt bound.
- permanent errors never retry.
- malformed retry_limit is rejected.
- backoff is capped and jitter is bounded/deterministic under injected test randomness.
- timeout values at min/max boundaries are accepted; values outside are rejected.
- output payload exceeding configured byte limit is rejected.
- sensitive values are redacted from normalized error metadata.

## 3. Required state-transition tests

- pending → running only after successful atomic claim.
- running → succeeded only for the active lease/generation.
- transient failure → retry_wait only when budget remains.
- permanent/exhausted failure → failed.
- due retry_wait → running after atomic claim.
- cancellation races safely with completion.
- terminal states cannot transition back to running.
- stale generation cannot overwrite current generation.
- expired lease can be recovered once, not concurrently by two workers.

## 4. Concurrency and recovery tests

- Two workers attempt to claim one queued run; exactly one wins.
- Duplicate enqueue with same idempotency key returns the same logical run.
- Two deliveries for one attempt do not create two side effects.
- Worker crash after claim but before execution is recoverable after lease expiry.
- Worker crash after provider side effect but before persistence is deduplicated by provider idempotency or outbox.
- Heartbeat from stale lease token is rejected.
- Expired lease cannot be renewed by the old worker.
- Attempt sequence is monotonic and unique.

## 5. Isolation tests (synthetic users only)

Create synthetic Owner A and Owner B in an isolated environment.

- Owner A cannot read Owner B run, step, attempt, or logs.
- Owner A cannot enqueue against Owner B workflow.
- Owner A cannot claim Owner B run.
- Owner A cannot complete, fail, cancel, or heartbeat Owner B work.
- A forged owner_id in request body is ignored/rejected.
- Anonymous request cannot access user worker path.
- Browser role cannot invoke internal cron claim RPC.
- Worker secret is never returned by any endpoint or log.

## 6. Contract and integration tests

- Database timeout constraint and runtime validator share one canonical maximum.
- API request schema rejects unknown lifecycle and ownership fields.
- Response DTO excludes lease tokens, service credentials, key hashes, and internal stack traces.
- Worker output schema is validated and size bounded.
- Logs use correlation IDs and normalized error codes, not raw secrets.
- Retry and terminal state are persisted transactionally.

## 7. Performance and resilience tests

- Queue claim query uses intended indexes under representative synthetic volume.
- Worker concurrency cap is respected.
- Queue backlog does not cause unbounded memory growth.
- Backoff does not synchronize all retries at the same instant.
- Long-running operations use async jobs rather than blocking synchronous execution.
- Graceful shutdown leaves leases recoverable.

## 8. Release gates

Do not mark Phase 51 complete until:
- All unit and state-machine tests pass.
- Isolated Owner A/B integration suite passes.
- Duplicate-delivery and crash-recovery tests pass.
- Migration is reviewed and tested on disposable environment.
- Security review confirms trusted worker boundary.
- Rollback procedure is exercised.
- Human approves production migration and deployment.

## 9. Current status

No Phase 51 runtime code, tests, migrations, or deployment have been implemented by this specification. This document is the acceptance contract for the implementation branch.
