# Append-Only Audit Event Contract

## Status

- CODED: immutable event envelope, deterministic canonical SHA-256 digest, optional previous-event hash, bounded metadata, sensitive-key rejection, and append-only storage protocol.
- NOT IMPLEMENTED: PostgreSQL schema, database permissions, transaction adapter, per-stream locking, key management, independent backup, and tamper-evidence verification job.
- TESTED: the audit-event tests passed within GitHub Actions run `43935238843` on commit `99226a393510ea99c11450ce4976cec731545375`; the run also passed changed-file Ruff, the Python test job, frontend TypeScript, and Vite build. This evidence applies to that exact commit only.
- NOT AUTHORIZED: schema migrations or deployment.

## Event contents

Events carry an event ID, stream ID, UTC epoch timestamp, actor, action, resource type and ID, outcome, correlation ID, bounded metadata, previous event digest, and event digest.

Metadata is restricted to shallow scalar values. Keys resembling credentials or secrets are rejected. Do not place request bodies, user content, signatures, tokens, private keys, or raw exception traces in audit metadata.

## Hash-chain semantics

The event digest is SHA-256 over canonical JSON with sorted keys and compact separators. The previous-event digest links an event to the prior event in the same stream.

A hash chain is tamper-evident only when the persistence adapter atomically:
1. locks or serializes the stream head;
2. verifies the submitted previous hash equals the persisted tail;
3. inserts the immutable event with a unique event ID;
4. updates the stream head;
5. commits all operations together.

The application role must not be able to update or delete existing events. Export signed checkpoints to independently protected storage to reduce the risk of a privileged database attacker rewriting the entire chain.

## Required production controls

- Database unique constraint on event ID.
- Transactional stream-head compare-and-append.
- Restricted database role: INSERT/SELECT only for event rows.
- Separate retention and backup policy.
- Verification job that checks each stream's hash continuity.
- Alerting on missing sequence links, duplicate IDs, or failed verification.
- Data minimization and retention limits.

The Python protocol and local digest do not provide durable immutability by themselves. No production storage adapter is included.


## Integrity verification

The pure-Python verifier recomputes each event digest from its immutable fields and
checks a supplied ordered chain for a valid root, matching stream IDs, unique event
IDs, and continuous previous-event links. It detects content alteration and broken
links in the supplied sequence.

It cannot independently prove that a database returned every event, that the
sequence was not truncated, or that a privileged attacker did not rewrite the
entire chain. Production must compare against a protected checkpoint and enforce
atomic ordering in storage.


## Durable persistence implementation status

- IMPLEMENTED ON THE HARDENING BRANCH: SQLAlchemy models for audit stream heads, audit events, approval intents, consumed nonce hashes, and a transactional outbox.
- IMPLEMENTED ON THE HARDENING BRANCH: transaction-scoped persistence primitives. The caller owns the SQLAlchemy transaction; the adapter does not commit. Approval signature verification must occur before calling the persistence function.
- IMPLEMENTED ON THE HARDENING BRANCH: nonce hashing before storage, database uniqueness for tenant/nonce, stream-head row locking, sequence uniqueness, scalar metadata limits, sensitive-key rejection, and an append-only database trigger for audit event UPDATE/DELETE.
- IMPLEMENTED, NOT EXECUTED: Alembic revision `0003_durable_audit_approval`. No database migration has been run.
- AUTHORED, NOT EXECUTED: SQLite-backed unit tests for hash-chain sequencing, metadata rejection, atomic approval persistence, duplicate nonce rejection, and expired-intent rejection.
- NOT VERIFIED: PostgreSQL integration behavior, concurrent first-writer retry behavior, actual RLS enforcement under the production application role, database grants, external checkpointing, and worker dispatch.
- CI STATUS: no successful GitHub Actions result has been confirmed for these new commits. Vercel status contexts currently report build-rate-limit failures; these are not evidence of GitHub Actions test results.

The first event in a new stream is protected by a composite primary key on the stream head. If concurrent first writers race, one transaction may receive a uniqueness error and must retry the entire transaction. Existing stream appends use SELECT FOR UPDATE to serialize sequence assignment.

The persistence function named `persist_verified_approval` does not perform cryptographic verification. It accepts only a previously verified approval context; callers must verify signature, signer authorization, request binding, expiry, and owner/tenant authorization before invoking it. The database transaction then atomically persists the nonce hash, intent, audit event, stream head, and outbox event.

The migration has not been applied. Before any migration is authorized, validate it against an isolated PostgreSQL database, inspect generated SQL and rollback behavior, and verify RLS and append-only behavior using the same restricted role intended for the application.