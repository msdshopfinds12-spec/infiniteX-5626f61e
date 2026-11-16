# Trusted Approval and Execution Foundation

Status: DESIGN SPECIFICATION — NOT IMPLEMENTED OR PRODUCTION-READY

Target repository: `msdshopfinds12-spec/infiniteX-5626f61e`
Target branch: `fix/infiniteX-foundation-hardening`
Baseline commit inspected: `dd645cc258113060f4c03f9ef115c0891feaeb35`

## 1. Scope and safety boundary

This phase defines the minimum trusted path from a proposed code change to a reviewed, tested Git commit. It does not enable autonomous writes, execute model-generated code, run migrations, merge, deploy, activate paid providers, or change repository settings.

The existing HMAC verifier remains a verification primitive. It is not a reviewer-authentication system or an approval-issuing service.

## 2. Required trust architecture

```text
Untrusted model / agent
        |
        v
Proposal API (bounded JSON; no shell execution)
        |
        v
Deterministic policy + path + secret + dependency checks
        |
        v
Immutable proposal record
  - repository numeric ID
  - target branch
  - observed base commit SHA
  - proposal fingerprint
  - sorted exact path set
  - policy and schema versions
        |
        v
Authenticated reviewer UI/API
  - validate JWT issuer, audience, signature, expiry
  - map subject to explicit reviewer permission
  - display exact diff and test evidence
  - require explicit approve/deny action
        |
        v
Approval issuer (isolated server-side trust boundary)
  - asymmetric signing key in secret manager/KMS
  - key ID (kid), short expiry, unique nonce
  - signs immutable approval claims
        |
        v
Approval verifier + durable one-time nonce store
        |
        v
Apply worker (separate GitHub App identity)
  - repository-scoped, contents:write only where required
  - re-read branch head; compare-and-swap against approved base SHA
  - apply only approved paths and exact blob contents
        |
        v
New immutable commit SHA
        |
        v
Isolated CI + security checks on that exact SHA
        |
        v
Human review of complete diff and CI evidence
        |
        v
Separate release authorization (merge/deploy/migration)
```

No model, agent, proposal payload, or generated code may call the signing or apply interfaces directly.

## 3. Approval token contract

Use an asymmetric signature (Ed25519 or ES256) for the production issuer/verifier boundary. Prefer asymmetric signing over sharing an HMAC secret between services: the issuer holds the private key; verifiers receive only public keys.

Required signed claims:
- `iss`: exact approval-service issuer
- `aud`: exact apply-service audience
- `jti`: cryptographically random unique approval nonce
- `sub`: authenticated reviewer subject
- `reviewer_role`: server-resolved permission at approval time
- `repository_id`: immutable numeric GitHub repository ID
- `target_branch`: exact branch name
- `base_commit_sha`: exact branch head inspected during review
- `proposal_id` and `proposal_sha256`: exact immutable proposal
- `file_paths`: sorted, unique exact allowlist
- `policy_version` and `schema_version`
- `iat`, `nbf`, `exp`: UTC NumericDate values; maximum lifetime 15 minutes

The apply service must reject unknown critical claims, wrong issuer/audience, invalid signature, unknown key ID, expired/future token, invalid reviewer role, repository mismatch, branch mismatch, base-SHA mismatch, proposal digest mismatch, file-set mismatch, and policy-version mismatch.

## 4. Replay prevention and atomic apply

A valid signature alone does not prevent replay. Persist every approval nonce in PostgreSQL with a unique constraint on `jti`. Consume it exactly once in the same transaction that creates the apply-intent record. A duplicate nonce must fail closed.

The apply worker must:
1. Load the immutable proposal by ID and recompute its digest.
2. Verify the signed approval and all claims.
3. Atomically consume the nonce.
4. Read the current target branch head.
5. Require current head == approved `base_commit_sha`; otherwise mark approval stale and require a new review.
6. Apply only the signed path allowlist and exact approved bytes.
7. Create a commit with the expected parent SHA; never force-push.
8. Persist the resulting commit SHA and immutable audit event.

A failed or interrupted apply must be recoverable through an idempotent apply-intent state machine. It must not silently issue a second commit or reuse an approval.

## 5. Durable execution queue requirements

The current `iq_core/execution/job_queue.py` is process-local. It is suitable for local tests, not multi-worker production execution.

The PostgreSQL queue must provide:
- durable job and attempt records
- atomic claims using row locks / `FOR UPDATE SKIP LOCKED`
- lease owner, lease expiry, and monotonically increasing fencing token
- heartbeat and lease renewal
- bounded retries with exponential backoff and jitter
- idempotency key with a unique database constraint
- dead-letter state and explicit operator redrive
- cancellation and timeout states
- transactionally persisted lifecycle events or an outbox
- tenant-scoped queries and authorization checks
- bounded payload size and schema versioning

A worker may complete a job only while holding the current unexpired lease and fencing token. A stale worker must not overwrite a newer attempt.

## 6. Sandboxed self-code test environment

Generated code is untrusted. Do not execute it in the API process, repository checkout process, or a privileged runner.

Use disposable isolated runners with:
- no host filesystem mounts
- no Docker socket or privileged mode
- non-root UID and read-only base filesystem
- CPU, memory, process-count, disk, and wall-clock limits
- network disabled by default
- no production secrets or deployment credentials
- ephemeral workspace and cleanup
- pinned toolchain and dependency lockfiles
- artifact capture with size limits
- separate static analysis, unit tests, dependency audit, and license checks

A passing test suite is evidence only for the tested commit and environment. It does not establish production readiness.

## 7. Repository and GitHub controls

At inspection time, GitHub reported branch protection disabled for `fix/infiniteX-foundation-hardening` and `main`. This is a configuration gap; this documentation commit does not change repository settings.

Before any merge or release, an owner must configure branch rules requiring:
- pull requests and at least one independent review where feasible
- required CI checks
- stale approval dismissal after new commits
- conversation resolution
- restricted force-push and deletion
- signed commits if supported by the team's operating model

The apply integration must use a dedicated GitHub App with least-privilege installation scope. Never put a personal access token, signing key, or deployment secret in source code, prompts, logs, or test fixtures.

## 8. Implementation sequence and gates

### Phase A — Approval issuer/verifier
- define versioned claim schema and canonical proposal serialization
- add asymmetric signing and public-key rotation by `kid`
- bind approval to repository ID, branch, base SHA, proposal digest, paths, reviewer, and policy version
- add reviewer authorization mapping
- add durable one-time nonce storage
- add negative tests for every rejected claim and replay

Exit gate: approval cannot be issued without authenticated reviewer permission; replay and stale-branch tests fail closed.

### Phase B — Durable queue
- add SQLAlchemy models and a reviewed Alembic migration
- implement atomic claim, lease, heartbeat, fencing, retry, and outbox
- add PostgreSQL integration tests with concurrent workers

Exit gate: two workers cannot own the same active lease; stale workers cannot commit results.

### Phase C — Isolated validation runner
- create a disposable, unprivileged test runner
- enforce resource and network boundaries
- collect reproducible test artifacts
- add malicious-input and timeout tests

Exit gate: runner has no production credentials and cannot reach host or deployment controls.

### Phase D — Apply integration
- use a dedicated least-privilege GitHub App
- enforce compare-and-swap against approved base SHA
- apply only exact signed paths and contents
- record resulting commit SHA and audit evidence

Exit gate: changed proposal, changed branch head, replayed approval, or extra file always blocks apply.

### Phase E — Final security and architecture audit
- tenant isolation and PostgreSQL RLS verification
- authentication and reviewer authorization review
- secrets and key-rotation review
- dependency/license and supply-chain review
- CI evidence and operational recovery review

Exit gate: no unresolved critical/high findings; all production capabilities have evidence and an owner.

## 9. Language and technology decisions

Keep the existing core stack:
- Python: API, policy, agents, queue workers, approval services, tests
- TypeScript: reviewer interface and typed API client
- PostgreSQL + SQL: durable state, audit records, nonce uniqueness, tenant isolation
- YAML: CI and declarative workflows
- JSON: versioned contracts and audit events
- Shell: reviewed local developer scripts only

Do not introduce Rust, Go, Java, or additional runtimes unless profiling or a concrete isolation requirement demonstrates a measurable benefit. More languages increase operational and supply-chain complexity.

## 10. Explicit non-goals

This phase does not promise unlimited tokens, unlimited compute, free hosted inference, autonomous self-improvement, self-approval, unrestricted shell access, automatic merge, or automatic deployment.

Current implementation statuses must remain truthful:
- HMAC approval evidence verification: implemented in the inspected branch; trusted issuance/authentication/replay service: not implemented.
- In-memory queue: implemented; durable distributed queue: not implemented.
- Mock provider runtime: implemented; live provider integration: not verified.
- Proposal validation/fingerprinting: implemented; safe patch application: not implemented.
- CI checks: rely on recorded GitHub Actions runs for the exact commit; never infer test execution from source files alone.
