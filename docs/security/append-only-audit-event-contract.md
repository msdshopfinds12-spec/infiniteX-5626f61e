# Append-Only Audit Event Contract

## Status

- CODED: immutable event envelope, deterministic canonical SHA-256 digest, optional previous-event hash, bounded metadata, sensitive-key rejection, and append-only storage protocol.
- NOT IMPLEMENTED: PostgreSQL schema, database permissions, transaction adapter, per-stream locking, key management, independent backup, and tamper-evidence verification job.
- NOT TESTED: tests are authored but have not been executed in this change.
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
