# GitHub Copilot Instructions — InfiniteX

Follow the repository-wide rules in `/AGENTS.md` before proposing or making changes.

## Project context
- Frontend: React 18, Vite, TypeScript.
- Existing AI orchestration modules are a foundation only; they do not establish a production provider integration or trusted backend.
- Supabase Edge Functions exist in the repository, but database schema, migration SQL, RLS policies, grants and production integration must be verified independently.
- Do not assume the frontend is connected to a live backend merely because adapters or UI components exist.

## Coding standards
- Inspect neighboring modules and existing conventions before editing.
- Prefer strict TypeScript types, small pure functions, explicit error paths and runtime validation at external boundaries.
- Keep server-only code and secrets out of browser imports and `VITE_*` variables.
- Avoid `any`, unsafe casts, dynamic code execution, unbounded recursion, unbounded retries and silent error swallowing.
- Use accessible semantic HTML, keyboard-operable controls, visible focus states and responsive layouts.
- Avoid adding dependencies where native platform APIs or existing packages suffice.

## AI and tool orchestration
- Use a provider adapter interface; do not bind domain logic to one vendor.
- Default to mock providers in CI and keep hosted providers disabled until server-side secrets, quotas, pricing and privacy controls are verified.
- Treat model output as untrusted. Validate every structured output against a schema.
- Tools must be explicitly allowlisted, least-privilege and server-authorized. No arbitrary shell, SQL, Git, deployment or filesystem execution from model text.
- Require action-scoped human approval for writes and destructive operations.

## Before finishing
- Explain the intended change and risks.
- Run relevant tests and report exact results; do not claim tests passed if they were not run.
- Update documentation only where it is authoritative and necessary.
- Never merge, deploy, migrate, change secrets, alter billing or perform destructive actions without explicit human approval.
