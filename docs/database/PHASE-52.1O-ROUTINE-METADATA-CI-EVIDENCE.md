# Phase 52.1O — Routine Metadata Compatibility CI Evidence

Date: 2026-11-20

## Source revision

- Repository: `msdshopfinds12-spec/infiniteX-5626f61e`
- Branch: `engineering/phase-52-1k-clean-room-replay-preparation`
- Head: `19a6d0c38e28af9bdfcd426ada44c76a4b294623`
- PR #77: OPEN, DRAFT, not merged
- Application CI: [44765043402](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44765043402) — success
- Database Contract Gate: [44765043362](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44765043362) — failure due to intentional source-readiness block

## Changes verified

The V2 catalog capture now distinguishes PostgreSQL `FUNCTION` and `PROCEDURE` records using `pg_proc.prokind`.

- A FUNCTION must have a string `resultType`.
- A PROCEDURE must have `resultType: null`.
- Unsupported routine kinds are rejected.
- The validator's routine schema requires an explicit `kind`.
- Regression coverage includes valid procedures, invalid procedure result types, and unsupported routine kinds.

## CI evidence

| Check | Result |
|---|---|
| Application CI | PASS |
| Database validator tests | 21 passed, 0 failed |
| Migration integrity and supporting offline tests | PASS |
| Disposable PostgreSQL 17 migration-chain rehearsal | PASS |
| Recovered migration replay | 19 PASS records |
| Reconstructed baseline | PASS, disposable and noncanonical |
| Candidate migration | PASS, disposable only |
| Disposable catalog execution | PASS |
| Disposable security behavior tests | PASS |
| Production safety invariant | PASS |
| Offline V2 source-readiness gate | BLOCKED |

## Remaining blocker

The committed contract snapshot remains legacy/incomplete V1. A fresh V2 catalog capture from the intended database, followed by independent human review and approval, is required. The validator correctly fails closed.

## Boundaries

This run does not prove canonical bootstrap provenance or live Supabase parity. No live database capture, production mutation, merge, deployment, or billing change was performed.

## Next step

Use a separately authorized, least-privilege read-only database session; independently verify project identity; run only the reviewed metadata-only SELECT; preserve raw output; validate completeness; retain `PENDING_HUMAN_REVIEW` until genuine human review.
