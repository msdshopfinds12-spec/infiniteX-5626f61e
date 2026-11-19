# Phase 6G.2 — Trusted Task Store Integration Boundary

## Delivered

Added `server/ai/approval-task-store-adapter.mjs` and focused contract tests. The adapter implements the callback shape expected by `createApprovedCapabilityService`:

- `getTaskSnapshot`: reads canonical task data using task ID and verified principal subject.
- `isTaskAwaitingApproval`: checks current owner-scoped task state and fails closed.
- `claimTaskForExecution`: forwards a fully scoped compare-and-claim request to the trusted store.

The adapter rejects incomplete task snapshots, invalid principals, cross-owner snapshots, malformed payload digests, and storage errors. It never accepts browser-supplied task input or agent/capability identity as the source of execution truth.

## Required durable-store contract

The concrete store MUST implement `claimApprovedTask` as one durable transaction / atomic conditional update. It must compare:

- task ID and owner/principal subject;
- expected task version;
- expected SHA-256 payload digest;
- agent ID and version;
- capability ID and version;
- current status `awaiting_approval`.

It must change status to `running`, increment the task version, and append the corresponding event in the same transaction. Exactly one claimant may succeed. Zero updated rows means stale, unauthorized, or already claimed.

Suggested SQL-level invariant (illustrative only; NOT a migration):

```sql
UPDATE tasks
SET status = 'running',
    version = version + 1,
    updated_at = now()
WHERE id = :task_id
  AND owner_subject = :principal_subject
  AND status = 'awaiting_approval'
  AND version = :expected_task_version
  AND payload_hash = :expected_payload_hash
  AND agent_id = :expected_agent_id
  AND agent_version = :expected_agent_version
  AND capability_id = :expected_capability_id
  AND capability_version = :expected_capability_version
RETURNING id, version;
```

The audit event must be inserted in the same transaction; if insertion fails, the status update must roll back. Add a unique constraint on `(task_id, sequence)` and a unique idempotency key for request creation in the eventual schema.

## Explicit limitations

- This is an integration boundary, not a database driver.
- No Supabase/PostgreSQL client is wired.
- No schema, migration, API route, authentication middleware, or persistent approval-token store was added.
- A process-local Map does not satisfy the durable atomicity requirement.
- The adapter cannot prove a driver is transactional; that property must be verified against the actual database implementation and concurrency tests.

## Verification

Tests cover principal scoping, owner isolation, missing/unavailable storage, malformed snapshots, exact atomic-claim arguments, false/throwing claim results, and required driver methods.

Run frontend CI and browser/accessibility CI on the resulting exact commit. Release remains blocked until a real durable store adapter and authentication boundary are implemented and independently verified.
