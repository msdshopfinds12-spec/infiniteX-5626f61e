# Retry and Lease State Machine

**Status:** Proposed behavior contract; implementation and schema are not verified.  
**Scope:** Safe retry semantics for workflow steps and external adapters.

## 1. Core distinction

Two counters must remain conceptually separate:

- **Run generation:** fences stale workers from an obsolete parent-run execution generation.
- **Step attempt number:** counts retries of one step within the applicable run generation.

Never increment the run generation merely to represent a step retry. Confirm exact existing column semantics before implementing either counter.

## 2. Candidate lifecycle

```text
queued
  |
  v
scheduled ----(available_at reached)----> claimed
                                           |
                                  lease valid + generation current
                                           |
                                           v
                                        running
                                      /    |     \
                              success   retryable  permanent
                                 |         |         |
                                 v         v         v
                             succeeded  scheduled  failed
                                            |
                                      retry budget
                                       exhausted
                                            |
                                            v
                                          failed

expired lease -> recovery decision -> reclaimed OR outcome_unknown
cancel request -> validated cancellation transition -> cancelled
```

The diagram is a logical proposal, not an assertion about current database enum values.

## 3. Retry classification

| Class | Default action |
|---|---|
| Explicitly allowlisted transient provider failure | Retry if operation is safe and budget remains |
| Rate limit with valid Retry-After | Schedule no earlier than provider guidance, within policy |
| Temporary network failure before request transmission | Retry if idempotent |
| Timeout after request may have reached provider | Reconcile; do not blindly replay |
| Authentication/authorization failure | Terminal; alert operator |
| Invalid input/schema/configuration | Terminal; require correction |
| Deterministic business-rule rejection | Terminal unless domain policy explicitly says otherwise |
| Unknown error | Fail closed; no automatic retry |

## 4. Backoff

Use bounded exponential backoff with full jitter:

`delay = random(0, min(cap, base * 2^retryIndex))`

Requirements:

- Clamp exponent and numeric values to avoid overflow.
- Apply a maximum elapsed-time budget.
- Respect Retry-After only within a configured maximum.
- Inject the random source and clock in tests.
- Persist the next scheduled time before acknowledging the failure.
- Do not sleep inside a worker to implement durable scheduling.

## 5. Claim and fencing contract

A claim operation must atomically:

1. Authenticate the service caller.
2. Lock or otherwise serialize the parent run and relevant attempt row.
3. Verify owner/tenant, workflow membership, run status and generation.
4. Verify the attempt is eligible and its schedule is due.
5. Verify no unexpired competing lease exists.
6. Generate a unique lease credential and expiry.
7. Transition to claimed/running and persist the attempt number.
8. Return only the data needed by the worker.

Every heartbeat and settlement must validate the same attempt identity, generation, lease verifier and lease expiry. A stale or expired worker must be rejected even if it finishes its external work later.

## 6. Settlement

- Success and failure transitions are compare-and-set operations.
- Only one terminal transition is accepted.
- Parent and child projections are updated atomically.
- Duplicate delivery returns a deterministic already-settled/conflict result without repeating side effects.
- If the database response is lost, the worker queries the attempt by stable operation ID before retrying settlement.
- A worker must not infer success from an HTTP timeout.

## 7. Lease recovery

Lease expiry does not prove the action failed. Recovery policy depends on side-effect class:

- **Pure/local deterministic action:** reclaim may be safe after confirming no durable completion.
- **Provider idempotency supported:** replay using the same stable idempotency key, then reconcile.
- **No idempotency or status API:** mark outcome unknown and require reconciliation or human review.

Lease renewal must be bounded by maximum execution duration and run-generation validity. A worker cannot renew after cancellation or generation change.

## 8. Required policy configuration

- Maximum step attempts
- Maximum elapsed time
- Base and cap delays
- Retryable error allowlist
- Operation side-effect classification
- Provider Retry-After cap
- Lease duration and heartbeat interval
- Maximum lease renewals
- Recovery behavior for ambiguous outcomes

Defaults must be conservative and validated server-side.

## 9. Required tests

Test deterministic classification, backoff boundaries, retry exhaustion, elapsed-time budget, Retry-After handling, clock/random injection, duplicate delivery, lost responses, lease expiry, renewal races, generation changes, cancellation races, ambiguous external outcome, and concurrent claim attempts.

## 10. Release gate

No automatic retry is enabled for a production adapter until idempotency/reconciliation semantics and database fencing are verified by integration tests.
