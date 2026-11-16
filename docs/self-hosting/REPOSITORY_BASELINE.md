# InfiniteX Repository Baseline — Self-Hosted Runtime

**Inspection ref:** `feat/provider-neutral-billing-sandbox`  
**Inspected head:** `2a7ce14bb34d78fd70610a93c6a2d40ba771fb1f`  
**Audit mode:** Read-only repository inspection  
**Runtime changes:** None  
**Deployment / migrations:** Not performed

## 1. Verified repository shape

The repository is currently a single-root Vite application. The tracked application structure includes:

- `src/App.tsx`, `src/main.tsx`, `src/types.ts`, `src/vite-env.d.ts`
- `src/components/` — AgentList, LogStream, MetricCard, PipelineBoard, Sidebar, TopBar
- `src/hooks/useTheme.ts`
- `src/styles/global.css`
- `public/favicon.svg`
- `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`
- `package.json`, `package-lock.json`

The current tree contains no `apps/api`, `apps/worker`, `packages/`, `infra/`, `database/`, or `tests/` runtime directories.

## 2. Package baseline

Current package metadata identifies a private ESM Vite application. Scripts:

- `dev: vite`
- `build: tsc -b && vite build`
- `preview: vite preview`
- `lint: tsc -b --noEmit`

Runtime dependencies currently listed:
- `@vercel/analytics`
- `lucide-react`
- `react`
- `react-dom`

Development dependencies currently listed:
- React type packages
- Vite React plugin
- TypeScript
- Vite

No Fastify, Node server framework, PostgreSQL driver/ORM, authentication framework, job queue, Docker orchestration dependency, or test runner is declared in this package manifest. This is a manifest-level observation, not a full dependency vulnerability audit.

## 3. TypeScript baseline

The root TypeScript configuration enables strict mode, no-unused-local and no-unused-parameter checks, ES2020 target, bundler module resolution, React JSX transform, and a `@/*` alias to `src/*`. Its include scope is the existing `src` directory, with a project reference to `tsconfig.node.json`.

A future backend should use its own TypeScript project configuration rather than weakening or overloading the current browser application configuration.

## 4. Important repository observations

- `dist/` and TypeScript build-info files appear in the inspected repository tree. Their tracking/ignore policy should be reviewed before any cleanup; do not delete them as part of this phase.
- `.gitignore` currently ignores `node_modules/`, `.env`, and Vite/Vitest timestamp artifacts. It does not visibly establish a complete policy for all environment variants, local databases, logs, coverage, Docker volumes, or generated artifacts.
- The branch also contains Cloudflare-oriented billing planning documents from earlier work. The new self-hosted architecture is the selected direction for future runtime design; these older documents should be labeled historical/alternative rather than silently treated as the active implementation target.
- A GitHub repository inspection does not execute the application or establish that the current build passes.

## 5. Proposed implementation boundary

Recommended first runtime milestone, after explicit approval:

1. Add an isolated `apps/api` package and separate TypeScript config.
2. Add a minimal API bootstrap with configuration validation, request IDs, safe errors, health/readiness endpoints and graceful shutdown.
3. Add API unit/contract tests and a CI command for them.
4. Add Docker development configuration only after its network and volume behavior is reviewed.
5. Keep PostgreSQL schema and migrations out of the first bootstrap commit; submit schema separately for review and approval.
6. Preserve the existing frontend and lockfile until dependency changes are approved and reviewed.

## 6. Approval requirements

The next source-code phase requires approval for:
- Adding backend runtime dependencies and updating package/lock files.
- Adding the API package and test tooling.
- Adding Dockerfiles and a development-only Compose configuration.

This report does **not** authorize:
- Database provisioning or schema migrations.
- Production credentials or real provider credentials.
- Public server exposure, domain/DNS/firewall changes, or deployment.
- Real payment processing, merchant onboarding, or payouts.
- Main-branch changes, merge, or release.

## 7. Evidence status

| Check | Status |
|---|---|
| Branch head and tracked tree inspected | VERIFIED |
| package.json inspected | VERIFIED |
| Root TypeScript config inspected | VERIFIED |
| Existing source layout inventoried | VERIFIED |
| Build command executed | NOT RUN |
| Lint command executed | NOT RUN |
| Test suite executed | NOT RUN |
| Backend runtime exists | NOT PRESENT IN INSPECTED TREE |
| PostgreSQL schema exists | NOT PRESENT IN INSPECTED TREE |
| Docker self-host runtime exists | NOT PRESENT IN INSPECTED TREE |
| Deployment | NOT PERFORMED |

**Conclusion:** the repository is a frontend-first Vite application with no declared backend runtime in its package manifest. A clean, isolated API package is safer than trying to turn the browser app into a server or mixing Node-only dependencies into the Vite client.
