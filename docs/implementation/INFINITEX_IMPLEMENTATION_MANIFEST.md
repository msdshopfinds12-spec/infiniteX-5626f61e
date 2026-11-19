# InfiniteX Zero-Budget Implementation Manifest

- Repository: msdshopfinds12-spec/infiniteX-5626f61e
- Base branch: main
- Implementation branch: feat/infiniteX-zero-budget-implementation
- Base commit at branch creation: 76b821789f52aa6f403bacb0508c6c989fdfa3a5
- Budget policy: strict PHP 0; no paid APIs, subscriptions, hosted AI inference, or new billing.
- Release policy: no merge, deployment, publication, migration, destructive action, or branch-protection change.
- Workflow: PLAN -> BUILD -> TEST -> AUDIT. Release requires separate human approval.
- Platform strategy: Android-installable PWA first. Native APK is a later build target and is not claimed by this plan.

## Engineering principles

1. Preserve main. All writes are confined to this implementation branch.
2. Inspect existing code and candidate branches before copying or replacing implementation.
3. Prefer small, reviewable commits and reuse compatible existing code over wholesale branch merges.
4. Demo data must be labelled as sample data. No fabricated telemetry, provider status, uptime, or security claims.
5. Browser code must not import privileged server modules or contain provider credentials.
6. AI execution is disabled by default. Provider adapters must be explicit, allowlisted, policy-checked, and independently testable.
7. No generated shell command, migration, deployment, or external side effect runs automatically.
8. Do not claim a test passed unless its result is observed and recorded.

## Phase 1 — Mobile UI and PWA foundation

| Path | Action | Acceptance |
|---|---|---|
| src/App.tsx | Update | Honest sample/connection state; working view navigation; no invented live metrics |
| src/components/AgentList.tsx | Update | Filterable sample records with safe empty state |
| src/components/PipelineBoard.tsx | Update | Clearly illustrative pipeline stages; no execution claim |
| src/components/LogStream.tsx | Update | Static sample events, not live telemetry |
| src/lib/dashboard-data.mjs | Create | Pure, safe sample-agent filtering helper |
| src/lib/dashboard-data.d.mts | Create | ESM TypeScript declaration for the filtering helper |
| src/lib/dashboard-data.d.ts | Create | Bundler-resolution compatibility declaration |
| tests/dashboard-data.test.mjs | Create | Search normalization, malformed data and injection-text contracts |
| src/components/MetricCard.tsx | Update | Accessible metric and unavailable-state presentation |
| src/components/Sidebar.tsx | Update | Responsive, keyboard-operable navigation |
| src/components/TopBar.tsx | Update | Accessible title, search and theme controls |
| src/styles/global.css | Update | Responsive mobile layout, focus states and WCAG AA contrast |
| src/main.tsx | Update | Safe PWA service-worker registration |
| index.html | Update | InfiniteX metadata, viewport and manifest reference |
| public/manifest.webmanifest | Create | Valid name, start URL, display mode, theme and icon metadata |
| public/sw.js | Create | Versioned static-asset cache; safe network fallback; no API/private-response caching |
| public/offline.html | Create | Accessible offline explanation and retry navigation |
| public/icons/infiniteX.svg | Create | Locally hosted scalable application icon |
| src/lib/pwa/registerServiceWorker.ts | Create | Production-only, guarded service-worker registration |
| tests/e2e/workspace.spec.mjs | Create | Navigation, theme, search and mobile viewport contracts |
| tests/e2e/accessibility.spec.mjs | Create | Automated accessibility checks when browser test dependencies are available |

Phase 1 completion requires an actual successful build and test execution. PWA installability must be verified against the built artifact; an SVG icon alone is not proof of Android installation readiness.

## Phase 2 — Provider-neutral AI core

| Path | Action | Acceptance |
|---|---|---|
| server/ai/agent-registry.mjs | Create | Validated agent definitions; disabled-by-default status |
| server/ai/policy.mjs | Create | Input/output, provider allowlist, cost and execution limits |
| server/ai/orchestrator.mjs | Create | Single-step bounded execution; timeout, cancellation and audit events |
| tests/ai-orchestration.test.mjs | Create | Positive, negative, timeout, cancellation and policy-denial tests |
| docs/architecture/AI_ORCHESTRATION.md | Create | Trust boundaries, lifecycle and limitations documented |

No model provider is configured by default. No browser bundle may import server/ai modules. No claim of free inference is permitted. Local deterministic tools may operate without a paid provider.

## Phase 3 — CI, dependency and security controls

| Path | Action | Acceptance |
|---|---|---|
| package.json | Update | Add only scripts and dependencies justified by verified tests |
| package-lock.json | Conditional update | Change only when dependency graph changes; regenerate reproducibly |
| .github/workflows/frontend-ci.yml | Create | Least-privilege CI for install, typecheck, tests and build |
| .github/workflows/security-regression.yml | Create | Read-only source-boundary and security regression checks |
| .github/scripts/verify-browser-boundary.mjs | Create | Detect forbidden server-only imports from browser entry points |
| .github/scripts/verify-browser-boundary.test.mjs | Create | Positive and negative scanner tests |
| .github/scripts/verify-workflow-policy.mjs | Create | Validate workflow permissions and unsafe trigger patterns |
| .github/scripts/verify-workflow-policy.test.mjs | Create | Policy scanner regression tests |
| scripts/dependency-policy.mjs | Create | Normalize npm audit output and fail on configured severe findings |
| scripts/dependency-policy.test.mjs | Create | Audit parser and policy decision tests |

Dependency remediation is evidence-led. Do not blindly accept npm audit fix or major-version upgrades. Preserve the lockfile and test the exact selected dependency tree.

## Phase 4 — Repository AI integration adapters

| Path | Action | Acceptance |
|---|---|---|
| server/integrations/adapter-registry.mjs | Create | Explicit adapter registration and capability metadata |
| tests/integration-adapters.test.mjs | Create | Compatibility, disabled adapter and policy tests |
| docs/architecture/REPOSITORY_AI_INTEGRATION_MAP.md | Create | Repository provenance, license, runtime, dependencies and verification status |

Candidate repositories include eve-software-factory-template, ai-master-controller, bagsikai-agent, personal-agent, jev-and-ai-sdk, msdshopfinds12-spec-infiniteGX.7-IQ-Core, eve-content-agent-template and eve-chat-template. None is considered integrated or production-ready until independently reviewed.

## Explicit exclusions

- No merge to main and no pull request merge.
- No deployment, release, public publishing or APK distribution.
- No paid APIs, paid plans, billing changes or mandatory cloud services.
- No database migrations, schema changes or live backend mutations.
- No secret creation, rotation, disclosure or client-side secret storage.
- No branch deletion, file deletion, force push or branch-protection modification.
- No unbounded autonomous agents or arbitrary generated shell execution.

## Verification record

Every phase must record:
- Exact branch and commit SHA.
- Changed paths and reasons.
- Commands actually executed and their exit status.
- Test totals and failures.
- Dependency audit findings and remediation rationale.
- Security and accessibility findings.
- Known limitations and rollback instructions.

Status: BUILD COMPLETE FOR THE CURRENT FRONTEND/PWA + PROVIDER-NEUTRAL AI FOUNDATION; AUTOMATED TESTS PASS; SECURITY AUDIT PARTIAL. This is not a complete production AI platform. No Android installation, backend integration or release is implied by this document.

## Execution record — 2026-11-19

- Branch-only implementation has started on `feat/infiniteX-zero-budget-implementation`.
- Main branch remains the base and has not been intentionally modified.
- PWA app shell, manifest, offline fallback and same-origin public asset cache were added.
- Provider-neutral server AI registry, deny-by-default policy and bounded single-step orchestrator were added. No provider is configured.
- Browser/server import-boundary scanner and regression tests were added.
- Android PWA installation guidance and repository AI integration/provenance map were added.
- Candidate AI repositories remain unintegrated because license/provenance and runtime compatibility gates are not yet complete.
- Unit/policy CI evidence: 25 tests passed on commit `d86fe08cd4338e0d6a69225da3df7fe83fa0cf87`; production build and npm audit also passed on that commit.
- Browser CI evidence: 7 Playwright tests passed, including both-theme automated WCAG checks, mobile viewport overflow/touch target checks, navigation, search safety, theme persistence and offline shell, on commit `f846a88a9106fa718f8fcf63961d521ac79d2622`.
- Browser workflow URL: https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44538623028
- The browser workflow build used Vite 6.4.6 and completed in 1.10 seconds.
- Final frontend CI on the manifest commit: typecheck passed; 25 unit/policy/contract tests passed; browser/server boundary scan passed; Vite 6.4.6 production build passed; npm audit reported 0 vulnerabilities.
- Final browser CI on the manifest commit: 7 Playwright tests passed; both-theme axe WCAG 2.1 A/AA checks passed; mobile viewport checks passed; offline shell check passed.
- Frontend CI URL: https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44539021720
- Final browser CI URL: https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44539021699
- Security audit remains partial: no backend/API/database/authentication deployment is present to audit; no tenant isolation or persistent audit log is proven.
- Android physical-device installation, APK generation, live backend, live model-provider execution, tenant isolation, persistent audit storage and production security are NOT TESTED / NOT IMPLEMENTED.
- No merge, deployment, public release, database migration, paid service, billing change, destructive operation or branch-protection change was performed.


## Phase 2 — Repository adapter foundation (2026-11-19)

- Added `server/integrations/adapter-contract.mjs`: metadata-only adapter registry; validates source URL, 40-character source commit, explicit license/reuse gates, runtime, narrow capability allowlist, no-network policy, and USD 0 budget; all adapters remain disabled.
- Added `tests/adapter-contract.test.mjs`: fail-closed tests for registration, duplicates, provenance, capabilities, network, budget, and reuse gates.
- Reviewed IQ Core source at `a0c81d1b7f691066320bf9dfd467ec828f0d11fc`; findings are documented in `docs/architecture/IQ_CORE_REPOSITORY_REVIEW.md`.
- IQ Core repository tree contained no LICENSE/COPYING file and README-referenced `docs/IQ_ARCHITECTURE.md` was absent. Therefore no IQ Core code was copied or executed. A future local Python worker remains blocked pending explicit license/reuse authorization and additional security/testing.
- IQ Core's current plugin manager trusts caller-supplied permission sets and does not sandbox handlers; event bus is synchronous and shallow-copies payloads; feedback loop is in-memory and unbounded. These are not production-ready integration guarantees.
- Current adapter contract is a metadata registry only; it is not a Python bridge and does not execute third-party code.

## Phase 3 — Repository intelligence and task lifecycle (2026-11-19)

- Added `docs/architecture/AI_REPOSITORY_REUSE_AUDIT.md` after account inventory and targeted inspection of candidate repositories, selected manifests, READMEs, trees, and license files.
- The audit rejects whole-repository merges. It distinguishes license evidence from dependency/runtime cost and records candidates that have no root license or are only placeholders.
- Added `server/integrations/task-lifecycle.mjs`: deterministic task-state transitions, human approval gate, actor restrictions, optimistic version checks, monotonic timestamps, immutable event history, and terminal-state protection. It does not execute tools or perform external side effects.
- Added `tests/task-lifecycle.test.mjs` for lifecycle transitions, approval, actor authorization, stale versions, terminal states, timestamp validation, and event sequencing.
- Current CI is running for this phase; do not mark this phase TESTED until completed workflow evidence is inspected.
- No external repository source has been copied or executed. No external service or AI provider was configured.

## Phase 3 verification update (2026-11-19)

- Frontend CI: **40 tests passed, 0 failed**; TypeScript checks, browser/server import-boundary scan, Vite production build, and npm audit all passed. npm audit reported 0 vulnerabilities at the configured moderate-or-higher threshold.
- Browser and accessibility CI: **7/7 Playwright tests passed**, including automated WCAG 2.1 A/AA checks in both themes, mobile viewport/touch-target checks, and production PWA/offline-shell behavior.
- Workflow evidence: [Frontend CI run 44541507729](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44541507729); [Browser CI run 44541507741](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44541507741).
- Task lifecycle is deterministic state management only. It is not a queue worker, durable event store, authenticated authorization service, or tool executor. The `actor` argument must be derived by trusted server-side code from a verified principal; it must never be accepted directly from an untrusted client.
- Repository reuse review is targeted, not a full legal/dependency audit. Candidates without verified root license remain excluded.
