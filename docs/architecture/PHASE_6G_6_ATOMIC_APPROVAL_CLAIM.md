# Phase 6G.6 — Atomic Approval and Task Claim

Status: IMPLEMENTED AS A SERVER-SIDE CONTRACT; durable database driver NOT IMPLEMENTED.
Branch: feat/infiniteX-zero-budget-implementation

## Problem corrected

The previous service sequence consumed an approval grant in one operation and attempted to claim the task in a second operation. If the claim failed after consumption, the approval was lost even though no task was claimed. This did not satisfy the transaction invariant specified in Phase 6G.4.

## New service contract

```js
createApprovedCapabilityService({
  approvalAuthority, // issue() required; consume() needed only for legacy fallback
  claimTaskWithApproval, // preferred atomic durable operation
  // other trusted callbacks...
});
```

When claimTaskWithApproval is supplied, the service:
1. Validates the one-time raw token format.
2. Computes SHA-256 inside the trusted server process.
3. Passes only the digest, verified principal context, task version/hash and agent/capability bindings to the atomic callback.
4. Executes the capability only if that callback returns literal true.
5. Does not call the legacy separate consume() and claimTaskForExecution() operations.

The adapter now exposes claimTaskWithApproval. Its driver contract is claimApprovedTaskWithApproval and receives approvalTokenDigest, never the raw token. A driver without that method fails closed.

The legacy two-step path remains for existing in-memory/demo compatibility and is explicitly not production-durable. Production wiring must always use the atomic callback.

## SQL mapping

The Phase 6G.4 proposal already defines private.claim_ai_task_with_approval with a digest argument and one transaction for grant consumption, task transition, lease assignment and event insertion. A future trusted server driver must map the adapter fields to that RPC, derive the owner from verified auth middleware, and return true only when exactly one claim row is returned.

No driver is connected yet. No Supabase schema changes or function calls were made.

## Regression coverage added

- Atomic callback receives only a SHA-256 digest; raw token is not passed.
- Atomic callback success skips both legacy consume and separate claim.
- Atomic callback failure prevents capability execution.
- Adapter validates digest/hash format and fails closed if the durable driver method is absent.
- Existing in-memory behavior remains covered by prior tests.

## Remaining gates

1. Run all GitHub Actions on this commit and inspect exact results.
2. Add a concrete server-only Supabase driver only after backend target and cost are confirmed.
3. Validate SQL against disposable PostgreSQL 17 and test transaction rollback/concurrent replay.
4. Add lease-fenced completion, renewal, cancellation and stale-worker recovery.
5. Complete security review and get explicit approval for any live migration.

## Safety

No migration, remote database write, secret access, deployment, billing change, merge or rebase occurred. This commit changes repository code and tests on the feature branch only.