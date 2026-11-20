# Phase 4N.18 — CI Source Readiness Classification

**Date:** 2026-11-20  
**Scope:** Make CI distinguish unavailable authoritative sources from invalid source artifacts without weakening the merge gate.

## Problem

Before this phase, the validators correctly returned exit code 2 when the migration directory or reviewed contract snapshot was absent. GitHub Actions rendered those steps as generic failures. That made an evidence gap look similar to a defect in an existing source artifact.

## Change

The workflow now captures each validator exit code and classifies it:

| Exit code | Meaning | Workflow behavior |
|---|---|---|
| 0 | Source present and structural checks pass | PASS |
| 1 | Source present but invalid, or unexpected validation error | FAIL |
| 2 | Required authoritative source is absent | BLOCKED |

A final merge-blocking step fails unless both validators return 0. This preserves the fail-closed policy while making the reason visible in the job summary.

The two regression suites remain mandatory. The production-safety invariant remains a separate job.

## Safety properties

- No production credentials are configured or consumed.
- No live database connection is attempted.
- Missing original migrations are not synthesized.
- Missing contract snapshots are not guessed.
- A PASS means only that the available source passes structural checks; it does not prove live schema parity.
- Merge remains blocked until authoritative sources are recovered and reviewed.

## Validation

The workflow change is committed to the draft recovery PR. Exact-head Actions run:

[Run #44657445503](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44657445503)

Its result must be inspected before this phase is marked verified. No merge, migration, deployment, secret change, or production write was performed.
