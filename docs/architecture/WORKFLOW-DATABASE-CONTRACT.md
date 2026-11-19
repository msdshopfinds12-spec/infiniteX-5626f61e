# Workflow Database Contract and Provenance

**Status:** Contract-recovery checklist; no production schema is asserted here.  
**Purpose:** Prevent guessed SQL and cross-branch schema contamination.

## 1. Source-of-truth hierarchy

Resolve conflicts using evidence in this order:

1. Current production database catalog and migration history, captured read-only.
2. Ordered migrations on the deployment branch, including checksums and commit SHAs.
3. Database function, trigger, RLS, grant, and index definitions from the same environment.
4. Application code that currently reads/writes those objects.
5. Historical branches and PRs, treated as proposals unless proven deployed.
6. Architecture documents and generated examples.

A branch containing a migration is not proof that the migration was applied. A test harness schema is not proof of production schema.

## 2. Required provenance record

For every recovered artifact, record:

- Repository and branch/ref.
- Commit SHA and file path.
- Migration filename, ordering, and checksum.
- Environment from which catalog output was obtained (never include credentials).
- Capture timestamp.
- Whether applied, pending, reverted, or unknown.
- Reviewer and evidence link.

Do not merge artifacts from different database environments until differences are reconciled.

## 3. Required inventory

Inspect and document the exact definitions for:

- `workflow_runs`
- `workflow_steps`
- `workflow_step_runs`
- Any attempt, queue, lease, event, or outbox tables
- Foreign keys and uniqueness constraints
- Check constraints and enum/domain definitions
- Indexes supporting claims and recovery
- RLS policies and table grants
- RPC signatures, function owners, SECURITY DEFINER/search_path settings
- Triggers and scheduled jobs
- All worker and API read/write paths

The names above are known from prior application references; their complete production definitions remain unverified until sourced.

## 4. Contract matrix

| Contract area | Evidence required | Gate |
|---|---|---|
| Run ownership | Actual columns, FK and policy definitions | No guessed owner column |
| Step membership | FK or validated workflow relationship | Cross-workflow access denied |
| Run generation | Exact attempt/generation semantics | Stale generation rejected |
| Step attempt number | Exact projection and uniqueness rules | Not conflated with run generation |
| Claim | Atomic SQL/RPC and lock behavior | Concurrent claims have one winner |
| Lease | Token representation, expiry, renewal semantics | Expired worker cannot settle |
| Retry | Durable schedule and retry limits | Restart-safe behavior |
| Settlement | Transactional completion/failure path | One terminal transition |
| Privileges | Grants, RLS, function execution rights | Public roles cannot invoke service-only transitions |

## 5. Required design constraints

- Preserve the existing meaning of `workflow_runs.attempt`; do not increment it for a step-local retry unless the authoritative contract explicitly defines it that way.
- A per-step retry counter must be distinct from a parent-run generation fence.
- Prefer append-only attempt history where auditability and recovery require it.
- Enforce claim uniqueness and state transitions inside database transactions.
- Lock the parent run before validating/updating dependent attempt state when that is required by the chosen concurrency design.
- Never assume an `owner_id` column exists on `workflow_steps`; verify the schema and enforce ownership through the authoritative relationship.
- Do not expose raw lease tokens in logs. Store a verifier/hash when the threat model and implementation support it.
- Keep privileged database credentials server-side.

## 6. Candidate attempt-ledger concepts (illustrative only)

A future design may need a durable per-step attempt record containing:

- Attempt identifier
- Run and step references
- Run generation captured at claim
- Step-local attempt sequence
- State and scheduled availability time
- Lease verifier and expiry
- Idempotency/correlation key
- Sanitized error classification
- Start and terminal timestamps

These are conceptual fields, not an approved table definition. Naming, types, constraints, indexes, RLS, and migration order must follow recovered source schema.

## 7. Read-only recovery procedure

1. Export migration filenames and checksums.
2. Capture table columns, constraints, indexes, policies, grants, triggers, and function definitions.
3. Compare deployed catalog with repository migration history.
4. Identify drift and unapplied migrations.
5. Map each application writer to its exact SQL/RPC.
6. Produce a signed-off contract matrix.
7. Only then author a migration proposal.

## 8. Stop conditions

Stop implementation if the schema is incomplete, the source environment is uncertain, ownership cannot be proven, migration ordering conflicts, or a proposed change would reinterpret existing attempt semantics.

## 9. Current status

**BLOCKED:** authoritative workflow schema provenance has not been established in the inspected source set. No migration is included in this documentation branch.
