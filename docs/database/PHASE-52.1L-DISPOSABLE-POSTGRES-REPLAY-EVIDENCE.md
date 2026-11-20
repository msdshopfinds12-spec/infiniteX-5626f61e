# Phase 52.1L — Disposable PostgreSQL 17 Replay Evidence Review

## Status

**PRIOR CI REPLAY: PASS — CURRENT 52.1K BRANCH RE-RUN: NOT VERIFIED**

This record corrects the earlier Phase 52.1K preparation status using actual GitHub Actions evidence discovered during the next read-only inspection. It does not claim the Phase 52.1K branch itself has been replayed.

## Evidence source

- Repository: `msdshopfinds12-spec/infiniteX-5626f61e`
- Workflow: `Database Contract Gate`
- Workflow run: `44753723123`
- Run URL: https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44753723123
- Run head branch: `engineering/phase-52-1d-reconstructed-baseline`
- Run head commit: `80697a74e0a893b5b0d722d7d50e7261d7a7b044`
- Run event: pull_request
- Run conclusion: `failure` (because the independent offline source-readiness gate correctly blocked on an unapproved/legacy contract snapshot)
- Replay job: `136347892505`
- Replay job name: `Supabase PostgreSQL 17 disposable migration-chain rehearsal`
- Replay job conclusion: `success`
- PostgreSQL server version in logs: `17.6`

## Actual replay observations

The replay job log contains:
- 19 individual `REPLAY PASS` records for the 19 ledger-recovered applied migrations.
- `RECONSTRUCTED BASELINE PASS` for the explicitly noncanonical disposable fixture.
- Final rehearsal summary: `Status: PASS`.
- `Applied migrations executed: 19`.
- `Candidate migration executed: yes (disposable only)`.
- Candidate migration was separately classified and was not counted among the 19 recovered applied migrations.
- Result statement: all recovered applied migrations and the separately classified candidate migration executed successfully in disposable PostgreSQL.
- Cleanup log: `docker rm -f infinitex-rehearsal-db` completed and printed the removed container name.

This is actual disposable execution evidence, not merely static SQL validation.

## Important scope and provenance qualifications

1. The successful replay was performed by the workflow run above on the Phase 52.1D branch and commit, not on the current Phase 52.1K preparation branch.
2. Read-only GitHub blob checks show that the replay manifest, replay runner script, and workflow file at the prior run commit have the same blob SHAs as those files on the current Phase 52.1K branch:
   - Manifest: `9866d287017b845e869f00510c69e9a9a660cdf5`
   - Runner: `be45a53a3b2d4f30fddc6bbdcf1e4fc937822e53`
   - Workflow: `df3dd917b09f60b173d057451f911f8b3ed86813`
3. Exact per-file SQL blob equivalence between the prior run commit and the current Phase 52.1K branch has not yet been independently established in this evidence review. Therefore do not state that the exact current branch was replayed.
4. Replay success does not prove original Git migration provenance, canonical bootstrap status, or parity with the live Supabase catalog.
5. The reconstructed application baseline is a test fixture only. It is not a canonical historical migration and must not be promoted to production.
6. The candidate hardening migration was tested separately in the disposable rehearsal; this is not authorization to apply it to a live database.

## Independent workflow failure

The overall workflow run concluded `failure`, but the disposable replay job succeeded. The failing job was `Offline migration and contract checks`, specifically the merge-blocking source-readiness gate.

Its logs show:
- Recovered migration integrity check: exit 0.
- Contract snapshot validation: exit 2 / BLOCKED.
- Validator message: `BLOCKED: legacy or incomplete contract version; a fresh v2 catalog capture is required.`
- Merge-blocking gate then exited 1, as designed.

Thus the workflow is not green. The failure is not evidence of a failed SQL replay; it is evidence that the approved Schema Contract V2 snapshot is still missing.

## Next required work

### 52.1L-A — Exact source equivalence
- Compare all 19 SQL blob SHAs at run commit `80697a74e0a893b5b0d722d7d50e7261d7a7b044` against the current Phase 52.1K branch head.
- Compare the candidate migration blob separately.
- Confirm manifest SHA-256 values match the exact files replayed.
- If any blob differs, the prior replay is historical evidence only; rerun the current branch.

### 52.1L-B — Current-branch replay
- Trigger the existing database contract workflow on a PR whose head is the current Phase 52.1K branch, or another explicitly isolated CI path.
- Confirm the replay job runs against the exact Phase 52.1K head SHA.
- Retain job logs and evidence artifacts.
- Do not merge the PR or deploy.

### 52.1M — Catalog parity
- Capture an approved, read-only live catalog snapshot using the existing least-privilege metadata capture path.
- Compare against the disposable replay catalog using normalized structural metadata.
- Report every difference; do not auto-repair either side.

## Gate decisions

| Control | Status |
|---|---|
| Prior isolated PostgreSQL 17.6 replay | PASS |
| Prior replay: 19 recovered migrations | PASS |
| Prior replay: reconstructed baseline fixture | PASS, noncanonical |
| Prior replay: separately classified candidate | PASS, disposable only |
| Prior container cleanup | Confirmed in job log |
| Current Phase 52.1K branch replay | NOT VERIFIED |
| Exact 19 SQL blob equivalence to prior run | NOT ESTABLISHED |
| Original Git provenance | NOT ESTABLISHED |
| Canonical bootstrap | NOT ESTABLISHED |
| Schema Contract V2 | BLOCKED |
| Live-vs-replay catalog parity | NOT RUN |
| Production migrations / writes | NOT AUTHORIZED |
| Merge / deployment | NOT AUTHORIZED |

## Final engineering decision

The previous Phase 52.1K document's statement that no PostgreSQL replay evidence existed is superseded by this record: a successful disposable PostgreSQL 17.6 replay exists on the Phase 52.1D commit.

However, do not upgrade the current Phase 52.1K branch to replay-PASS until exact SQL source equivalence is established or the workflow is rerun on that exact branch head. The overall CI workflow remains red because Schema Contract V2 is blocked. No production action is authorized.
