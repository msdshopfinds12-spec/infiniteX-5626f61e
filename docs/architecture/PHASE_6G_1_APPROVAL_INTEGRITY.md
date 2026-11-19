# Phase 6G.1 — Approval Integrity

## Security contract

The approved-capability service now requires a trusted `getTaskSnapshot` callback. The callback must load canonical task state from server-owned storage using a principal already produced by verified authentication middleware.

Approval grants bind all of the following:

- Principal subject
- Task ID and task version
- Agent ID and agent version
- Capability ID and capability version
- SHA-256 digest of canonical JSON containing the task input and all identifiers/versions above
- Action and expiry

Execution reloads the server-owned task snapshot, recomputes the digest, consumes the one-time grant, and passes only the loaded snapshot to the executor. Browser-supplied `input`, `agentId`, and version values are not used as execution authority.

## Required integration contract

`claimTaskForExecution` MUST perform an atomic compare-and-transition in the durable task store. It must compare task ID, task version, payload hash, agent/capability identifiers and versions, and principal authorization before moving the task to `running`. A boolean callback backed only by process memory is not production-safe.

`getTaskSnapshot` MUST return a fresh immutable view from trusted storage and must not accept task contents from the browser. Task input must be JSON-compatible plain data. Unsupported values, cycles, non-finite numbers, and non-plain objects are rejected before hashing.

## Remaining limitations

- Approval authority remains process-local and non-durable.
- The service is not authentication middleware or an HTTP route.
- Durable atomic claim semantics depend on the concrete storage adapter.
- No production provider, remote tool, or deployment is enabled by this patch.
- Multi-process replay protection requires a shared transactional grant store or database-backed atomic consume operation.

## Verification

Run `npm test`, `npm run lint`, `npm run check:browser-boundary`, `npm run build`, and `npm run test:e2e` in CI. Do not mark browser/accessibility verification complete until the exact commit has successful workflow evidence.
