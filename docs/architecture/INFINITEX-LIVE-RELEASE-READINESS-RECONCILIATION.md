# InfiniteX live release-readiness reconciliation

**Evidence date:** 2026-11-20 UTC  
**Scope:** Read-only inspection of GitHub, Supabase metadata/catalogs, deployed Edge Function source, and Vercel project/deployment metadata.  
**Mutation status:** No live database writes, migrations, Edge Function deployments, Vercel configuration changes, merges, or production releases were performed.

## Executive decision

InfiniteX has a working frontend build candidate and a real Supabase backend foundation, but it is **not production-release ready**. The main blockers are deployed-source drift, frontend/backend integration, CORS configuration verification, and unresolved Vercel canonical-project ownership.

## GitHub candidate evidence

- PR #49 is the frontend hardening candidate.
- PR #46 is the main-based canonical Edge Function candidate.
- PR #50 combines the PR #49 frontend baseline with the reviewed PR #46 backend source, tests, workflows, and documentation.
- PR #50 exact head `1dc3709a627607762ed1e41be5a9a630527620b0` passed all three configured GitHub Actions workflows: dependency/audit/lint/test/build, Phase 4N.7 worker security/build, and Phase 4N.8A Node/Deno/type-check/build.
- PR #50 remains Draft and unmerged. CI success does not establish production parity or browser/device QA.

## Supabase live evidence

Project `Ashaa-INX` (`vepacoemkhudamfaccah`) reported `ACTIVE_HEALTHY`, PostgreSQL 17.11.0.003, region `ap-northeast-2`.

Read-only catalog and metadata checks found:

- 14 public base tables; RLS is enabled on all 14.
- 19 public RLS policies.
- 19 migration ledger entries. The original SQL bodies for those historical migrations are not established by this audit; do not reconstruct or replay guessed migrations.
- Three active Edge Functions: `simula-workflow-worker`, `simula-workflow-cron-worker`, and `ashaa-api-key-manager`.
- The source retrieved for all three deployed functions differs from the canonical GitHub candidate source. Source equality checks returned false for each function.
- `workflow_runs.attempt` and `workflow_step_runs.attempt` exist. `workflow_step_runs` has a unique constraint on `(run_id, step_id)`.
- Existing claim/verification RPCs are present. The proposed Phase 4N.8B `simula_transition_workflow_step` RPC is not present in the inspected live function catalog.
- The Phase 4N.8A candidate uses existing attempt columns and compare-and-set updates; it is a smaller schema-change surface than Phase 4N.8B, but still requires local integration and operational review before deployment.

### Security Advisor nuance

The Security Advisor reports `public.billing_webhook_events` as RLS-enabled without a policy. The read-only privilege query found table grants only for `postgres` and `service_role`, with no `anon` or `authenticated` grants. Treat this as a hardening/monitoring item, not confirmed public exposure. Do not add a broad policy merely to silence the advisor.

The Performance Advisor reports six informational unused-index findings. Do not drop indexes without workload evidence and a separate approved change.

## Vercel project ambiguity

Two Vercel projects are linked to the same GitHub repository:

| Project | Framework | Node | Domain | Latest deployment |
|---|---|---:|---|---|
| `infinitexultra` | `python` | 24.x | `infinitexultra.vercel.app` | BLOCKED |
| `msd-digital-finds` | `vite` | 22.x | `infinite-x-5626f61e.vercel.app` | BLOCKED |

Both latest deployments are blocked by Vercel's verified-commits gate. The `infinitexultra` framework setting does not match this Vite/React application. The `msd-digital-finds` framework does match. The inspected environment-variable listing returned no visible environment variables for either project.

The intended production domain/project must be confirmed before changing framework, verified-commit settings, environment variables, or deployment configuration.

## Release blockers

1. **Canonical hosting target:** confirm which Vercel project/domain is the production target.
2. **Frontend integration:** the current React app still explicitly operates in demo mode. Supabase Auth, user-owned projects, workflow CRUD, and live telemetry are not wired into the UI.
3. **CORS configuration:** the candidate Edge Functions use an exact-origin allowlist via `INFINITEX_ALLOWED_ORIGINS`. Verify the deployed secret/configuration and allowed production/preview origins before rollout.
4. **Deployed-source parity:** review and deploy the candidate Edge Function source only after its configuration and rollback plan are verified.
5. **Database provenance:** preserve the 19-entry migration ledger; obtain authoritative historical SQL or a verified schema snapshot before proposing any migration.
6. **QA:** add browser-level, keyboard, responsive Android, auth/session, and real API integration tests.
7. **Release controls:** keep Draft until exact-head CI, source review, local integration, staging verification, rollback readiness, and explicit production approval are complete.

## Explicitly excluded from this phase

- No Phase 4N.8B migration was applied.
- No production database or user data was modified.
- No Edge Function was deployed.
- No Vercel settings, domains, environment variables, or verified-commit controls were changed.
- No PR was merged and no production release was performed.
