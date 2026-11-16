# Sandboxed Code Validation Boundary

## Status

- CODED: immutable request/result contracts, fixed execution profiles, bounded resource settings, and a SandboxExecutor protocol.
- NOT IMPLEMENTED: container or microVM runner, filesystem snapshotting, workspace provisioner, output redaction pipeline, artifact quarantine, and production executor adapter.
- NOT TESTED: the repository test suite has not been executed as part of this change.
- NOT AUTHORIZED: applying generated patches to a target branch, creating database migrations, deployment, or release.

## Intended lifecycle

1. A trusted server verifies the reviewer signature and exact proposal scope.
2. A durable transaction consumes the approval nonce and persists the immutable apply-intent record.
3. A trusted worker loads that persisted record and creates a short-lived disposable workspace at the exact base commit.
4. The worker submits a SandboxExecutionRequest using one of the fixed profiles.
5. An external isolation layer enforces the declared controls.
6. Results and artifacts are collected, scanned, and associated with the execution ID.
7. A separate reviewer evaluates the diff and test evidence before any target-branch write.

## Fixed profiles

| Profile | Fixed argv |
|---|---|
| python-unit-tests | python -m pytest -q |
| python-lint | python -m ruff check . |
| frontend-tests | npm test -- --run |
| frontend-build | npm run build |

The request contains a profile enum, not a user-supplied shell command. Adapters must execute argv directly without a shell.

## Mandatory isolation controls

- No network access from the sandbox.
- No repository, cloud, deployment, or package-registry credentials mounted into the sandbox.
- Read-only host/root filesystem; write access only to a disposable workspace.
- Enforced CPU, memory, wall-clock, process-count, and output-size limits.
- Unprivileged UID, dropped capabilities, syscall filtering, and process-tree cleanup.
- Workspace created from a pinned base commit; no shared writable host mounts.
- Dependency installation must use a separately reviewed, controlled dependency cache or prebuilt image; do not grant general network access to make installs succeed.
- Output and artifacts are untrusted; redact secrets, scan files, and never auto-apply artifacts.
- Destroy the workspace after evidence collection, retaining only approved, sanitized evidence.

## Important trust boundary

The from_persisted_intent factory accepts an ApprovalApplyIntent object. The caller must obtain it from the durable store only after the trusted approval service has verified the reviewer and the atomic nonce/apply-intent transaction has committed. The factory does not itself prove persistence or consume approval evidence.

The sandbox validates code; it does not authorize a patch write. A successful exit code is evidence for review, not permission to merge, commit, deploy, or release.

## Production readiness gate

Before connecting an executor, implement and independently review:
- a container or microVM adapter with the controls above;
- workspace creation pinned to repository ID, branch, and base SHA;
- a durable execution record and append-only audit events;
- cancellation, timeout, crash recovery, and cleanup tests;
- adversarial tests for path escape, symlinks, resource exhaustion, network egress, secret exposure, and malicious build scripts;
- human approval before any target-branch mutation.

No production sandbox adapter is included in this commit.
