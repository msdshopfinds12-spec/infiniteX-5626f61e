# Execution Engine Architecture

**Phase:** 8 — Execution Engine  
**Status:** Local, synchronous execution foundation; no distributed worker infrastructure.

## Components

- `JobQueue`: thread-safe process-local queue with atomic claim, due-time checks, and guarded job transitions.
- `RetryManager`: deterministic bounded exponential backoff; no sleeping or background retry loop.
- `EventEngine`: in-process event history, correlation IDs, and best-effort subscribers.
- `TaskEngine`: runs one claimed job through the existing IQ kernel, records attempt task IDs, and applies retry/dead-letter policy.
- `WorkflowEngine`: validates dependency graphs and executes steps sequentially in topological order; failed dependencies block downstream steps.
- `Scheduler`: one-shot in-memory schedules that are dispatched only when a caller explicitly polls due items.

## Lifecycle

`QUEUED → RUNNING → COMPLETED`  
`QUEUED → RUNNING → QUEUED` (retry scheduled)  
`QUEUED → RUNNING → DEAD_LETTER` (attempt limit reached)  
`QUEUED → RUNNING → BLOCKED` (no handler)

Each job has a stable job ID and correlation ID. Each kernel attempt has a distinct IQ task ID so the IQ kernel's single-execution invariant is preserved across retries.

## Security and side-effect boundaries

The execution package is a Python library only. No new public API route or background worker is activated. Future endpoints must require owner-authenticated server-side authorization. Tool calls, network access, code changes, and destructive actions must be routed through the future capability gateway and governance/approval controls.

## Limitations

- Queue, event history, and schedules are process-local and lost on restart.
- Execution is synchronous; no worker pool or distributed locking.
- Workflows are sequential; parallel branches are not implemented.
- Retries are scheduled as timestamps; an operator/worker must poll and run due jobs.
- Scheduler is manual-poll and one-shot only; no automatic recurring timer.
- Existing persistent task API is not switched over to this new queue in this phase.
- Owner-only security remains a required but not end-to-end verified target.
