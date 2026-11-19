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

Status: BUILD IN PROGRESS; TEST PARTIALLY VERIFIED; AUDIT NOT COMPLETE. No Android installation, backend integration or release is implied by this document.

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
- The full frontend CI workflow for the final documentation/workflow-only commit is pending final confirmation.
- Android physical-device installation, APK generation, live backend, live model-provider execution, tenant isolation, persistent audit storage and production security are NOT TESTED / NOT IMPLEMENTED.
- No merge, deployment, public release, database migration, paid service, billing change, destructive operation or branch-protection change was performed.

