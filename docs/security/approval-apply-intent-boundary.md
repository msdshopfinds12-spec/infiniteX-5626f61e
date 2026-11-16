# Approval Apply-Intent Boundary

**Status: DOMAIN CONTRACT CODED; PRODUCTION STORAGE NOT IMPLEMENTED.**

## Purpose

Separate cryptographic approval verification from any future code execution. A
verified approval can be transformed into an immutable, tightly scoped apply
intent. The intent is not a command to execute code and cannot authorize a
different repository, branch, base commit, proposal digest, policy version, or
file set.

## Atomic persistence contract

A production adapter for `ApprovalApplyIntentStore.record_once` must:

1. Start a database transaction.
2. Insert the approval nonce into a table with a unique constraint on nonce ID.
3. Insert the immutable apply-intent record referencing that nonce.
4. Commit both inserts together.
5. Return `False` for a duplicate nonce; roll back on every other failure.

A process-local set, memory cache, or non-transactional pair of writes is not
acceptable for production replay protection.

## Implemented

- immutable `ApprovalApplyIntent` domain record
- conversion only from the typed `ApprovalClaims` verification result
- persistence protocol with explicit atomicity requirements
- replay rejection at the domain boundary
- unit tests authored with an in-memory test double

## Not implemented

- PostgreSQL tables, unique constraints, or migrations
- production transaction adapter
- audit-event persistence
- API endpoint
- patch worker or code execution
- executed test evidence

## Security boundary

The test double is not a durable replay defense. No caller may treat a successful
domain-level test as evidence that production replay prevention is active. Do
not execute patches based only on an apply-intent record. A separate isolated
worker, policy gate, and human release authorization remain mandatory.
