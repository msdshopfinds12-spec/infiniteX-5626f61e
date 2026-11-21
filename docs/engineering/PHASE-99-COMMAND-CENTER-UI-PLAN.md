# Phase 99 — InfiniteX Command Center UI Plan

**Base:** Phase 98 exact-head verified commit `b8ead4a659ec8a89cc1868b73ba92df622c66c44`
**Branch:** `phase-99-command-center-ui`
**Scope:** React UI truthfulness, responsive command center, workflow activity navigation.
**Production changes:** none.

## Verified current UI issues

- `AgentList.tsx` renders hard-coded demo agents with synthetic running/error states.
- `LogStream.tsx` renders hard-coded sample log events and sample test counts.
- The main overview already reports AI runtime disconnected, but the dedicated Agents and Logs views still present illustrative data as operational-looking records.
- `WorkflowRunHistory` already supports authenticated run history and per-run event metadata through `WorkflowLogList`.
- AI runtime Phase 98 is server-side and intentionally returns 503 until an approved provider adapter and quota policy exist.

## Objective

Deliver an honest, mobile-first InfiniteX Command Center without fabricated agents, execution events, test counts, deployment states or security status.

## Planned UI behavior

1. **Overview / Command Center**
   - Keep bounded authenticated workflow/project counts.
   - Distinguish data available from unavailable telemetry.
   - Show AI runtime provider disabled; no invented active-agent count.
   - Show security verification as repository CI evidence, not live production posture.

2. **AI Agents**
   - Replace static sample agent records with a capability registry status.
   - State clearly: runtime boundary implemented, provider disabled, no live agents registered/verified.
   - No fake running/idle/error agents.

3. **Log Stream**
   - Remove fabricated timestamped log lines and illustrative test counts.
   - Explain that per-run event metadata is accessible from Pipelines → workflow → run → Events.
   - Do not imply a global real-time stream exists.

4. **Navigation and mobile UX**
   - Keep touch targets and keyboard focus visible.
   - Add readable labels to compact mobile navigation.
   - Ensure no horizontal overflow at 390px viewport.
   - Improve section headings and empty states without changing auth or database boundaries.

## Implementation manifest

| Area | Files | Acceptance |
|---|---|---|
| Agent capability state | `src/components/AgentList.tsx` | no sample records; accurate disabled state |
| Log activity state | `src/components/LogStream.tsx` | no fake logs; clear navigation to run events |
| App composition | `src/App.tsx` | truthful capability copy |
| Navigation | `src/components/Sidebar.tsx` | session-aware label and mobile accessible names |
| Styling | `src/styles/global.css` | responsive cards and no overflow |
| Tests | `tests/ui/phase-99-command-center-contract.test.mjs` | no fabricated telemetry, correct statuses |
| Browser E2E | `scripts/phase-96-workflow-browser-e2e.mjs` | agents/logs view browser assertions |
| CI | phase 96 browser workflow | execute on Phase 99 branch |

No database schema, provider integration, secrets, billing, production migration or deployment is in scope.

## Design direction

- Dark-first command center with existing navy/blue token system.
- Compact operational status cards, clear typography and restrained color.
- Use status semantics: VERIFIED, DISABLED, NOT CONNECTED, NOT MEASURED, NOT VERIFIED.
- Empty states should explain the next available user action.
- Preserve the existing theme switch and avoid decorative animations that impair reduced-motion users.

## Acceptance criteria

- No fabricated AI agent records.
- No fabricated log entries, timestamps, or test counts.
- All live workflow history remains sourced from authenticated RLS-protected services.
- All capability labels match Phase 98 provider-disabled behavior.
- 390px Chromium viewport has no horizontal overflow.
- Keyboard-visible focus and accessible navigation labels remain present.
- npm/Deno tests, browser E2E and production build pass.

**Plan status:** APPROVED FOR REPOSITORY-ONLY IMPLEMENTATION.
**Release status:** NOT APPROVED.
