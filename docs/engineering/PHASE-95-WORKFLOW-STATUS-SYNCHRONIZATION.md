# Phase 95 — Workflow Status Synchronization

**Base:** `9c4c0ae6fd5158fed2d1a1bcdad249f170305237` (Phase 94 exact-head CI pass)
**Branch:** `phase-95-workflow-status-synchronization`
**Scope:** Browser read-path synchronization, tests, responsive UI and documentation only.
**Production migration / deployment / merge:** NOT PERFORMED

## Objective

After Phase 94 proved enqueue → authenticated worker → PostgreSQL persistence → owner-scoped history in disposable CI, make the browser history reflect persisted worker transitions without pretending that queue acceptance means execution completion.

## Design decision

Use bounded polling of the existing authenticated read service. Do not add a browser worker invocation, a new database write path, realtime subscription, or a new production migration.

### Polling contract

- Poll interval: 5 seconds.
- Poll only when at least one server-returned run has status `queued` or `running`.
- Stop polling when all visible runs are terminal or no runs exist.
- Pause scheduled polling while the document is hidden.
- Refresh once immediately when the document becomes visible again.
- Provide a manual “Refresh now” action.
- On a read error, stop automatic polling and expose the existing manual retry path.
- Clear timers and visibility listeners on effect cleanup.
- Existing request-key and active-effect guard continue to prevent stale results from rendering after account/workflow changes.

## Security and correctness properties

- Reads continue through the authenticated Supabase client and existing RLS boundary.
- The browser never writes `workflow_runs` status or calls the worker endpoint.
- Only explicit safe run summary columns are queried; input, output and raw error details remain excluded.
- UI does not claim that `queued` means executed or succeeded.
- Polling is bounded and pauses in hidden tabs to reduce unnecessary traffic and battery/network use.
- No external provider, notification delivery, billing or secret handling is introduced.

## Files changed

- `src/features/workflows/workflow-run-polling.ts`: active-state policy and bounded interval.
- `src/features/workflows/workflow-run-polling.test.ts`: terminal and active-state unit tests.
- `src/features/workflows/workflow-run-history.tsx`: visibility-aware refresh lifecycle and manual refresh control.
- `src/styles/global.css`: responsive history toolbar.
- `tests/security/phase-95-workflow-status-sync.test.mjs`: source-contract checks.
- `.github/workflows/infinitex-quality-gates.yml`: Phase 95 branch trigger.

## Verification required

The exact final Phase 95 branch HEAD must pass:
1. npm ci and npm audit.
2. TypeScript lint.
3. Node unit/regression suite, including the new polling policy and source-contract tests.
4. Edge Function / worker security tests.
5. Deno type checks and worker tests.
6. Production frontend build.

This phase does not change SQL or worker execution behavior; the Phase 94 disposable PostgreSQL integration remains the preceding backend evidence, not a substitute for Phase 95 browser verification.

## Alternatives considered

1. **Supabase Realtime:** lower perceived latency, but requires deployed publication/table configuration, subscription lifecycle, reconnect handling and additional operational verification. Deferred until production realtime configuration is verified.
2. **Fixed polling regardless of state:** simpler but wastes requests after terminal completion and in hidden tabs. Rejected.
3. **Client-side status mutation or worker invocation:** breaks the server authority boundary. Rejected.
4. **Manual refresh only:** lowest complexity but poor status visibility for normal asynchronous workflows. Kept as a fallback, not the primary path.

## Release gate

No production migrations, Edge Function deployments, secrets, billing, public publishing, pull request merge or live provider calls are authorized by this phase.

**Status before CI:** IMPLEMENTED / NOT YET VERIFIED.
**Release status:** NOT APPROVED.
